-- ============================================================================
-- Fitma internal — Projects board (synced from WebWork projects, like the
-- existing Workspace). Each employee sees projects assigned to them.
-- ============================================================================
create table if not exists fitma_projects (
  webwork_project_id   bigint primary key,
  name                 text not null,
  client               text,
  assignee_webwork_id  bigint,
  status               text default 'active',
  updated_at           timestamptz default now()
);
create index if not exists idx_fitma_projects_assignee on fitma_projects(assignee_webwork_id);
alter table fitma_projects enable row level security;  -- RPC-only

-- Sync upsert (called by the daily job with the sync_key).
create or replace function fitma_sync_projects(p_key text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ok boolean; n int;
begin
  select exists(select 1 from fitma_settings where key='sync_key' and value=p_key) into ok;
  if not ok then return jsonb_build_object('error','unauthorized'); end if;
  insert into fitma_projects(webwork_project_id,name,client,assignee_webwork_id,updated_at)
  select (x->>'id')::bigint, x->>'name', x->>'client', nullif(x->>'assignee','')::bigint, now()
  from jsonb_array_elements(p_rows) x
  on conflict (webwork_project_id) do update set
    name=excluded.name, client=excluded.client, assignee_webwork_id=excluded.assignee_webwork_id, updated_at=now();
  get diagnostics n = row_count;
  return jsonb_build_object('ok',true,'rows',n);
end $$;
grant execute on function fitma_sync_projects(text,jsonb) to anon, authenticated;

-- Admin report: add projects.
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
    'projects',   (select coalesce(jsonb_agg(to_jsonb(pr) order by pr.webwork_project_id desc),'[]'::jsonb) from fitma_projects pr),
    'generated_at', now()
  );
end $$;
grant execute on function fitma_team_report(text) to anon, authenticated;

-- Employee report: add own projects (no hours).
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
    'projects', (select coalesce(jsonb_agg(jsonb_build_object('name',pr.name,'client',pr.client) order by pr.webwork_project_id desc),'[]'::jsonb) from fitma_projects pr where pr.assignee_webwork_id=mid),
    'generated_at', now()
  );
end $$;
grant execute on function fitma_my_report(text,text) to anon, authenticated;

select 'projects schema ready' as status;
