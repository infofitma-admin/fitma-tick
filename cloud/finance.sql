-- ============================================================================
-- Fitma Tick (Cloud) — Finances (Piece 6a)
-- ----------------------------------------------------------------------------
-- A company bills ITS OWN clients from tracked time, records payments against
-- those invoices, and runs payroll for its members. This is separate from the
-- `invoices` table in schema.sql (that one is for a company paying Fitma for
-- the tracker subscription).
--
-- Every row carries company_id and is MANAGER-ONLY (owner/admin): pay and
-- client-billing data must never be visible to ordinary members. RLS enforces
-- both the company wall and the manager-only rule in the database itself.
-- ============================================================================

-- --- member pay settings (on the existing memberships row) -----------------
alter table memberships add column if not exists pay_type    text;            -- 'hourly' | 'fixed' (null = hourly)
alter table memberships add column if not exists monthly_pay numeric(10,2);   -- used when pay_type = 'fixed'
-- (memberships.hourly_rate already exists in schema.sql, used for hourly pay)

-- --- per-project client billing rate ---------------------------------------
alter table projects add column if not exists bill_rate numeric(10,2);        -- hourly rate charged to the client

-- ===========================================================================
-- CLIENT INVOICES  (company -> its client)
-- ===========================================================================
create table if not exists client_invoices (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  number      text not null,                                 -- e.g. INV-2026-0001 (unique per company)
  client_name text not null,
  project_id  uuid references projects(id) on delete set null,
  status      text not null default 'draft',                 -- draft | sent | paid | void
  currency    text not null default 'USD',
  issued_on   date not null default current_date,
  due_on      date,
  paid_on     date,
  subtotal    numeric(12,2) not null default 0,
  tax_pct     numeric(5,2)  not null default 0,
  total       numeric(12,2) not null default 0,
  notes       text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  unique (company_id, number)
);
create index if not exists idx_client_invoices_company on client_invoices(company_id, issued_on);

create table if not exists client_invoice_items (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  invoice_id  uuid not null references client_invoices(id) on delete cascade,
  description text not null,
  qty         numeric(10,2) not null default 1,              -- hours or units
  rate        numeric(10,2) not null default 0,
  amount      numeric(12,2) not null default 0,              -- qty * rate (computed in app)
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_client_invoice_items_inv on client_invoice_items(invoice_id);

-- ===========================================================================
-- PAYMENTS RECEIVED  (against a client invoice)
-- ===========================================================================
create table if not exists client_payments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  invoice_id  uuid references client_invoices(id) on delete set null,
  amount      numeric(12,2) not null,
  received_on date not null default current_date,
  method      text,                                          -- transfer | cash | card | cheque | online | other
  reference   text,
  note        text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_client_payments_company on client_payments(company_id, received_on);

-- ===========================================================================
-- PAYROLL  (company pays its members)
-- ===========================================================================
create table if not exists payroll_runs (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  period_start date not null,
  period_end   date not null,
  status       text not null default 'draft',                -- draft | finalized | paid
  currency     text not null default 'USD',
  total        numeric(12,2) not null default 0,
  note         text,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index if not exists idx_payroll_runs_company on payroll_runs(company_id, period_start);

create table if not exists payroll_items (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  run_id      uuid not null references payroll_runs(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  pay_type    text not null default 'hourly',                -- hourly | fixed
  hours       numeric(10,2) not null default 0,
  rate        numeric(10,2) not null default 0,
  gross       numeric(12,2) not null default 0,
  note        text
);
create index if not exists idx_payroll_items_run on payroll_items(run_id);

-- ===========================================================================
-- ROW-LEVEL SECURITY  —  company wall + manager-only
-- ===========================================================================
alter table client_invoices      enable row level security;
alter table client_invoice_items enable row level security;
alter table client_payments      enable row level security;
alter table payroll_runs         enable row level security;
alter table payroll_items        enable row level security;

do $$ begin
  -- client_invoices
  create policy ci_rw on client_invoices for all
    using (is_manager(company_id)) with check (is_manager(company_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy cii_rw on client_invoice_items for all
    using (is_manager(company_id)) with check (is_manager(company_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy cp_rw on client_payments for all
    using (is_manager(company_id)) with check (is_manager(company_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy pr_rw on payroll_runs for all
    using (is_manager(company_id)) with check (is_manager(company_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy pi_rw on payroll_items for all
    using (is_manager(company_id)) with check (is_manager(company_id));
exception when duplicate_object then null; end $$;

select 'finance schema ready' as status;
