-- ============================================================================
-- Fitma Tick — Operator (platform) dashboard
-- Lets Fitma (the product owner) see every company, user, trial and dollar,
-- without ever exposing one customer's data to another. All reads go through
-- SECURITY DEFINER functions that first check the caller is a platform admin.
-- ============================================================================

create table if not exists platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table platform_admins enable row level security;  -- no policies: only the functions below read it

create or replace function is_platform_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid()) $$;

-- Whole-platform totals (one JSON blob for the dashboard tiles).
create or replace function platform_stats() returns jsonb
  language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not is_platform_admin() then raise exception 'not authorized'; end if;
  select jsonb_build_object(
    'companies',     (select count(*) from companies),
    'companies_7d',  (select count(*) from companies where created_at > now() - interval '7 days'),
    'companies_30d', (select count(*) from companies where created_at > now() - interval '30 days'),
    'members',       (select count(*) from memberships where status = 'active'),
    'active_today',  (select count(distinct user_id) from time_entries where started_at >= date_trunc('day', now())),
    'active_7d',     (select count(distinct user_id) from time_entries where started_at > now() - interval '7 days'),
    'time_entries',  (select count(*) from time_entries),
    'hours',         (select coalesce(round(sum(duration_sec)/3600.0, 1), 0) from time_entries),
    'screenshots',   (select count(*) from screenshots),
    'by_status',     (select coalesce(jsonb_object_agg(sub_status, c), '{}'::jsonb) from (select sub_status, count(*) c from companies group by sub_status) s),
    'by_plan',       (select coalesce(jsonb_object_agg(plan_code, c), '{}'::jsonb) from (select plan_code, count(*) c from companies group by plan_code) p),
    'est_mrr',       (select coalesce(round(sum(pl.price_monthly_usd * mc.cnt), 2), 0)
                        from companies co
                        join plans pl on pl.code = co.plan_code
                        join (select company_id, count(*) cnt from memberships where status = 'active' group by company_id) mc
                          on mc.company_id = co.id
                        where co.sub_status = 'active')
  ) into r;
  return r;
end $$;

-- One row per company, for the operator's companies table.
create or replace function platform_companies() returns table(
  id uuid, name text, slug text, plan_code text, sub_status text,
  members int, created_at timestamptz, last_activity timestamptz)
  language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'not authorized'; end if;
  return query
    select c.id, c.name, c.slug, c.plan_code, c.sub_status,
      (select count(*)::int from memberships m where m.company_id = c.id and m.status = 'active'),
      c.created_at,
      (select max(t.started_at) from time_entries t where t.company_id = c.id)
    from companies c order by c.created_at desc;
end $$;

grant execute on function is_platform_admin()   to authenticated;
grant execute on function platform_stats()      to authenticated;
grant execute on function platform_companies()  to authenticated;

-- Seed the demo owner as a platform admin so the operator view can be tested.
insert into platform_admins(user_id)
  select id from auth.users where email like 'backend.test+%@acmestudio-demo.com'
  on conflict do nothing;

select 'platform admins' as what, count(*) from platform_admins;
