-- ============================================================================
-- Fitma internal — Monthly performance scoring
-- Scores out of 10: Project Management, Time Management, Eager to Learn, + notes.
-- Employees see a month only once the admin publishes it (and the month ended).
-- ============================================================================
create table if not exists fitma_performance (
  id            uuid primary key default gen_random_uuid(),
  webwork_id    bigint not null,
  period        text not null,                 -- 'YYYY-MM'
  project_mgmt  int,                           -- 0..10
  time_mgmt     int,                           -- 0..10
  eager_to_learn int,                          -- 0..10
  notes         text,
  published     boolean default false,
  updated_at    timestamptz default now(),
  unique (webwork_id, period)
);
alter table fitma_performance enable row level security;  -- RPC-only, no anon policies

-- Admin: set / update a member's monthly score (PIN-gated).
create or replace function fitma_set_score(p_pin text, p_webwork_id bigint, p_period text,
  p_pm int, p_tm int, p_eager int, p_notes text, p_published boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ok boolean;
begin
  select exists(select 1 from fitma_settings where key='admin_pin' and value=p_pin) into ok;
  if not ok then return jsonb_build_object('error','unauthorized'); end if;
  insert into fitma_performance(webwork_id,period,project_mgmt,time_mgmt,eager_to_learn,notes,published,updated_at)
  values (p_webwork_id,p_period,p_pm,p_tm,p_eager,p_notes,coalesce(p_published,false),now())
  on conflict (webwork_id,period) do update set
    project_mgmt=excluded.project_mgmt,time_mgmt=excluded.time_mgmt,eager_to_learn=excluded.eager_to_learn,
    notes=excluded.notes,published=excluded.published,updated_at=now();
  return jsonb_build_object('ok',true);
end $$;
grant execute on function fitma_set_score(text,bigint,text,int,int,int,text,boolean) to anon, authenticated;

-- Admin report: whole team + attendance + ALL performance rows.
create or replace function fitma_team_report(p_pin text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ok boolean;
begin
  select exists(select 1 from fitma_settings where key='admin_pin' and value=p_pin) into ok;
  if not ok then return jsonb_build_object('error','unauthorized'); end if;
  return jsonb_build_object(
    'members',    (select coalesce(jsonb_agg(to_jsonb(m) order by m.name),'[]'::jsonb) from fitma_members m where coalesce(m.role,'')<>'admin'),
    'attendance', (select coalesce(jsonb_agg(to_jsonb(a) order by a.work_date),'[]'::jsonb) from fitma_attendance a),
    'performance',(select coalesce(jsonb_agg(to_jsonb(p) order by p.period desc),'[]'::jsonb) from fitma_performance p),
    'generated_at', now()
  );
end $$;
grant execute on function fitma_team_report(text) to anon, authenticated;

-- Employee self report: own attendance (no hours) + own PUBLISHED scores for ended months.
create or replace function fitma_my_report(p_email text, p_pin text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare mid bigint; mrole text; mname text; mpin text; is_admin boolean; cur text;
begin
  select exists(select 1 from fitma_settings where key='admin_pin' and value=p_pin) into is_admin;
  select webwork_id, role, name, pin into mid, mrole, mname, mpin from fitma_members where lower(email)=lower(p_email);
  if mid is null then return jsonb_build_object('error','not_found'); end if;
  if not (is_admin or (mpin is not null and mpin=p_pin)) then return jsonb_build_object('error','unauthorized'); end if;
  cur := to_char(now() at time zone 'Asia/Colombo','YYYY-MM');
  return jsonb_build_object(
    'member', jsonb_build_object('name',mname,'role',mrole),
    'attendance', (select coalesce(jsonb_agg(jsonb_build_object(
        'work_date',a.work_date,'start_time',a.start_time,'status',a.status,
        'is_late',a.is_late,'is_left_early',a.is_left_early,'activity_pct',a.activity_pct,'working_day',a.working_day
      ) order by a.work_date),'[]'::jsonb) from fitma_attendance a where a.webwork_id=mid),
    'performance', (select coalesce(jsonb_agg(jsonb_build_object(
        'period',p.period,'project_mgmt',p.project_mgmt,'time_mgmt',p.time_mgmt,'eager_to_learn',p.eager_to_learn,'notes',p.notes
      ) order by p.period desc),'[]'::jsonb) from fitma_performance p where p.webwork_id=mid and p.published=true and p.period < cur),
    'generated_at', now()
  );
end $$;
grant execute on function fitma_my_report(text,text) to anon, authenticated;

select 'performance schema ready' as status;
