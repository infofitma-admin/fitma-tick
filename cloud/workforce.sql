-- ============================================================================
-- Fitma Tick (Cloud) — Time Off + Shifts (Piece 6b)
-- ----------------------------------------------------------------------------
-- Time off: a member requests leave; a manager approves or rejects. Each member
-- has an annual paid-leave allowance; "taken" is summed from approved paid leave.
-- Shifts: a manager schedules working hours per member per day; the app compares
-- planned vs actually-tracked hours.
--
-- Members can see and create their OWN time-off requests and see their OWN
-- shifts; managers see and manage the whole team. RLS enforces this in the DB.
-- ============================================================================

-- annual paid-leave allowance (days) on the membership row
alter table memberships add column if not exists leave_allowance numeric(6,1);  -- null = company default (14)

-- ===========================================================================
-- TIME OFF
-- ===========================================================================
create table if not exists time_off_requests (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null default 'vacation',             -- vacation | personal | sick | unpaid | other
  start_date  date not null,
  end_date    date not null,
  days        numeric(5,1) not null default 1,              -- leave days this request uses
  reason      text,
  status      text not null default 'pending',              -- pending | approved | rejected
  decided_by  uuid references auth.users(id),
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_time_off_company on time_off_requests(company_id, start_date);
create index if not exists idx_time_off_user on time_off_requests(user_id);

-- ===========================================================================
-- SHIFTS  (scheduled working hours)
-- ===========================================================================
create table if not exists shifts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  shift_date  date not null,
  start_time  time not null default '09:00',
  end_time    time not null default '17:00',
  note        text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_shifts_company on shifts(company_id, shift_date);
create index if not exists idx_shifts_user on shifts(user_id, shift_date);

-- ===========================================================================
-- ROW-LEVEL SECURITY
-- ===========================================================================
alter table time_off_requests enable row level security;
alter table shifts            enable row level security;

-- Time off: read own or (manager) all; create own; only managers decide/edit;
-- a member may withdraw (delete) their own request, managers may delete any.
do $$ begin
  create policy tor_sel on time_off_requests for select
    using (user_id = auth.uid() or is_manager(company_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy tor_ins on time_off_requests for insert
    with check (user_id = auth.uid() and is_member(company_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy tor_upd on time_off_requests for update
    using (is_manager(company_id)) with check (is_manager(company_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy tor_del on time_off_requests for delete
    using (is_manager(company_id) or user_id = auth.uid());
exception when duplicate_object then null; end $$;

-- Shifts: read own or (manager) all; only managers create/edit/delete.
do $$ begin
  create policy shift_sel on shifts for select
    using (user_id = auth.uid() or is_manager(company_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy shift_w on shifts for all
    using (is_manager(company_id)) with check (is_manager(company_id));
exception when duplicate_object then null; end $$;

select 'workforce schema ready' as status;
