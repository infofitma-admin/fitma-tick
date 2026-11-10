-- ============================================================================
-- Fitma Tick (Cloud) — Multi-tenant time-tracking SaaS
-- Postgres / Supabase schema  ·  v1 (Phase 1 MVP)
-- ----------------------------------------------------------------------------
-- Tenancy model:
--   * A "company" is a tenant. Each paying customer = one company.
--   * Fitma's own team is just one company with a free/internal plan.
--   * Users (Supabase auth.users) join companies via "memberships".
--   * EVERY data row carries company_id, and Row-Level Security (RLS) makes it
--     impossible for one company to read another company's data — enforced by
--     the database itself, not the app. This is the core of real SaaS isolation.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helper: who am I, and which companies am I in / what role?
-- ---------------------------------------------------------------------------
create or replace function auth_uid() returns uuid
  language sql stable as $$ select auth.uid() $$;

-- ===========================================================================
-- CORE TENANCY
-- ===========================================================================

create table companies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text unique not null,
  owner_id        uuid not null references auth.users(id),
  -- billing
  plan_code       text not null default 'trial',          -- trial | starter | pro | enterprise | internal(free)
  seats           int  not null default 1,
  sub_status      text not null default 'trialing',        -- trialing | active | past_due | canceled
  trial_ends_at   timestamptz not null default now() + interval '14 days',
  period_end      timestamptz,                             -- when current paid period ends (access lock after)
  -- settings (screenshot interval, blur, working days, etc.)
  settings        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

-- Public mirror of auth.users (name/avatar), one row per person.
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- Links a person to a company, with their role in THAT company.
create table memberships (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'member',             -- owner | admin | member
  status      text not null default 'active',             -- active | invited | disabled
  schedule    jsonb not null default '{}'::jsonb,          -- working hours per weekday
  hourly_rate numeric(10,2),                               -- optional, for billable/payroll
  created_at  timestamptz not null default now(),
  unique (company_id, user_id)
);
create index on memberships(user_id);
create index on memberships(company_id);

-- Pending invitations (before a person has an auth account).
create table invites (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  email       text not null,
  role        text not null default 'member',
  token       text not null unique default encode(gen_random_bytes(18),'hex'),
  invited_by  uuid references auth.users(id),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);
create index on invites(company_id);

-- --- membership helper functions (used by every RLS policy) ---------------
create or replace function is_member(cid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m
                 where m.company_id = cid and m.user_id = auth.uid()
                   and m.status = 'active') $$;

create or replace function is_manager(cid uuid) returns boolean   -- owner or admin
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m
                 where m.company_id = cid and m.user_id = auth.uid()
                   and m.status = 'active' and m.role in ('owner','admin')) $$;

-- ===========================================================================
-- TRACKING DATA  (all scoped by company_id)
-- ===========================================================================

create table projects (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  name        text not null,
  client      text,
  color       text,
  status      text not null default 'active',              -- active | done | paused
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on projects(company_id);

create table tasks (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  project_id  uuid references projects(id) on delete set null,
  title       text not null,
  assigned_to uuid references auth.users(id),
  due_date    date,
  status      text not null default 'todo',                -- todo | doing | done
  created_at  timestamptz not null default now()
);
create index on tasks(company_id);

-- A worked time block (from the desktop timer or manual entry).
create table time_entries (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  project_id   uuid references projects(id) on delete set null,
  task_id      uuid references tasks(id) on delete set null,
  started_at   timestamptz not null,
  ended_at     timestamptz,
  duration_sec int,
  source       text not null default 'desktop',            -- desktop | manual
  created_at   timestamptz not null default now()
);
create index on time_entries(company_id, user_id, started_at);

-- Activity level samples (keyboard/mouse %, NOT keylogging).
create table activity_samples (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  time_entry_id uuid references time_entries(id) on delete cascade,
  sampled_at    timestamptz not null,
  activity_pct  int,                                        -- 0..100
  keyboard      int,
  mouse         int
);
create index on activity_samples(company_id, user_id, sampled_at);

-- Screenshots (file lives in Supabase Storage; we store the path + meta).
create table screenshots (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  time_entry_id uuid references time_entries(id) on delete cascade,
  captured_at   timestamptz not null,
  storage_path  text not null,
  thumb_path    text,
  activity_pct  int,
  blurred       boolean not null default false
);
create index on screenshots(company_id, user_id, captured_at);

-- App & website usage (Phase 2 feature; table ready now).
create table app_usage (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  time_entry_id uuid references time_entries(id) on delete cascade,
  started_at    timestamptz not null,
  app_name      text,
  title         text,
  url           text,
  host          text,
  duration_sec  int
);
create index on app_usage(company_id, user_id, started_at);

-- ===========================================================================
-- BILLING
-- ===========================================================================

create table plans (
  code             text primary key,                       -- starter | pro | enterprise | internal
  name             text not null,
  price_monthly_usd numeric(10,2) not null,                 -- shown price; billed annually
  features         jsonb not null default '{}'::jsonb,
  active           boolean not null default true
);

create table subscriptions (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  plan_code    text not null references plans(code),
  seats        int not null default 1,
  status       text not null default 'trialing',            -- trialing | active | past_due | canceled
  period_start timestamptz,
  period_end   timestamptz,
  created_at   timestamptz not null default now()
);
create index on subscriptions(company_id);

-- Invoices: generated on "Subscribe", paid by transfer, marked paid by an admin.
create table invoices (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  number          text unique not null,
  amount_usd      numeric(10,2) not null,
  status          text not null default 'pending',          -- pending | paid | void
  issued_at       timestamptz not null default now(),
  due_at          timestamptz,
  paid_at         timestamptz,
  payment_ref     text,                                     -- customer's transfer reference
  instructions    jsonb not null default '{}'::jsonb,       -- payment details shown to customer
  created_at      timestamptz not null default now()
);
create index on invoices(company_id);

-- Seed the public plans (prices adjustable).
insert into plans(code,name,price_monthly_usd,features) values
  ('starter','Starter',3.99,'{"screenshots":true,"activity":true,"projects":true,"reports":"basic"}'),
  ('pro','Professional',6.99,'{"screenshots":true,"activity":true,"projects":true,"reports":"advanced","app_url":true,"integrations":true}'),
  ('enterprise','Enterprise',0,'{"custom":true,"sso":true,"white_label":true}'),
  ('internal','Fitma Internal (free)',0,'{"all":true}')
on conflict (code) do nothing;

-- ===========================================================================
-- ROW-LEVEL SECURITY  —  the wall between companies
-- ===========================================================================
alter table companies        enable row level security;
alter table profiles         enable row level security;
alter table memberships      enable row level security;
alter table invites          enable row level security;
alter table projects         enable row level security;
alter table tasks            enable row level security;
alter table time_entries     enable row level security;
alter table activity_samples enable row level security;
alter table screenshots      enable row level security;
alter table app_usage        enable row level security;
alter table subscriptions    enable row level security;
alter table invoices         enable row level security;
alter table plans            enable row level security;

-- Plans are public (read-only) so the pricing page can show them.
create policy plans_read on plans for select using (true);

-- Profiles: you can see/edit your own.
create policy profiles_self on profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

-- Companies: members can read their company; only managers can update it.
create policy companies_read   on companies for select using (is_member(id));
create policy companies_update on companies for update using (is_manager(id));
create policy companies_insert on companies for insert with check (owner_id = auth.uid());

-- Memberships: members see their company's roster; managers manage it.
create policy memberships_read   on memberships for select using (is_member(company_id));
create policy memberships_write  on memberships for all    using (is_manager(company_id)) with check (is_manager(company_id));

-- Invites, projects, tasks, billing: readable by members, writable by managers.
create policy invites_rw   on invites       for all using (is_manager(company_id)) with check (is_manager(company_id));
create policy projects_r   on projects      for select using (is_member(company_id));
create policy projects_w   on projects      for all using (is_manager(company_id)) with check (is_manager(company_id));
create policy tasks_r      on tasks         for select using (is_member(company_id));
create policy tasks_w      on tasks         for all using (is_manager(company_id)) with check (is_manager(company_id));
create policy subs_r       on subscriptions for select using (is_member(company_id));
create policy subs_w       on subscriptions for all using (is_manager(company_id)) with check (is_manager(company_id));
create policy inv_r        on invoices      for select using (is_member(company_id));
create policy inv_w        on invoices      for all using (is_manager(company_id)) with check (is_manager(company_id));

-- Tracking data: a member can WRITE their own rows; managers can READ the whole
-- team's; a member can READ their own. (So staff can't see each other, admins can.)
create policy te_read   on time_entries     for select using (user_id = auth.uid() or is_manager(company_id));
create policy te_write  on time_entries     for all    using (user_id = auth.uid() and is_member(company_id)) with check (user_id = auth.uid() and is_member(company_id));
create policy act_read  on activity_samples for select using (user_id = auth.uid() or is_manager(company_id));
create policy act_write on activity_samples for insert with check (user_id = auth.uid() and is_member(company_id));
create policy ss_read   on screenshots      for select using (user_id = auth.uid() or is_manager(company_id));
create policy ss_write  on screenshots      for insert with check (user_id = auth.uid() and is_member(company_id));
create policy au_read   on app_usage        for select using (user_id = auth.uid() or is_manager(company_id));
create policy au_write  on app_usage        for insert with check (user_id = auth.uid() and is_member(company_id));

-- ============================================================================
-- End of schema. Phase-2 tables (idle, integrations, payroll runs) added later.
-- ============================================================================
