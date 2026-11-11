-- ============================================================================
-- Fitma Tick — Internal team dashboard (Fitma's own staff) on Supabase
-- Real attendance/hours from WebWork, synced daily. Private: no anon table
-- access; all reads go through a PIN-checked SECURITY DEFINER function.
-- ============================================================================
create table if not exists fitma_members (
  id            uuid primary key default gen_random_uuid(),
  webwork_id    bigint unique,
  name          text not null,
  email         text,
  role          text,                       -- intern | senior | founder | admin
  target_minutes int,                       -- daily target (240=4h, 180=3h); null=founder
  active        boolean default true,
  created_at    timestamptz default now()
);
create table if not exists fitma_attendance (
  id            uuid primary key default gen_random_uuid(),
  webwork_id    bigint not null,
  work_date     date not null,
  start_time    text,
  end_time      text,
  worked_minutes int default 0,
  activity_pct  int,
  status        text,
  is_late       boolean default false,
  is_left_early boolean default false,
  working_day   boolean default true,
  updated_at    timestamptz default now(),
  unique (webwork_id, work_date)
);
create index if not exists idx_fitma_att_date on fitma_attendance(work_date);
create index if not exists idx_fitma_att_member on fitma_attendance(webwork_id, work_date);

create table if not exists fitma_settings (key text primary key, value text);
insert into fitma_settings(key,value) values
  ('admin_pin','Fitma#Team2026'),
  ('sync_key', encode(gen_random_bytes(16),'hex'))
on conflict (key) do nothing;

alter table fitma_members    enable row level security;
alter table fitma_attendance enable row level security;
alter table fitma_settings   enable row level security;
-- (no policies -> anon/authenticated have NO direct table access; RPC only)

-- Admin report: whole team, PIN-gated.
create or replace function fitma_team_report(p_pin text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ok boolean;
begin
  select exists(select 1 from fitma_settings where key='admin_pin' and value=p_pin) into ok;
  if not ok then return jsonb_build_object('error','unauthorized'); end if;
  return jsonb_build_object(
    'members',   (select coalesce(jsonb_agg(to_jsonb(m) order by m.name),'[]'::jsonb) from fitma_members m where coalesce(m.role,'') <> 'admin'),
    'attendance',(select coalesce(jsonb_agg(to_jsonb(a) order by a.work_date),'[]'::jsonb) from fitma_attendance a),
    'generated_at', now()
  );
end $$;
grant execute on function fitma_team_report(text) to anon, authenticated;

-- Employee self report: one member by email, PIN-gated (their own login pin).
create or replace function fitma_my_report(p_email text, p_pin text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ok boolean; mid bigint;
begin
  select exists(select 1 from fitma_settings where key='admin_pin' and value=p_pin) into ok;
  if not ok then return jsonb_build_object('error','unauthorized'); end if;
  select webwork_id into mid from fitma_members where lower(email)=lower(p_email);
  if mid is null then return jsonb_build_object('error','not_found'); end if;
  return jsonb_build_object(
    'member',    (select to_jsonb(m) from fitma_members m where m.webwork_id=mid),
    'attendance',(select coalesce(jsonb_agg(to_jsonb(a) order by a.work_date),'[]'::jsonb) from fitma_attendance a where a.webwork_id=mid),
    'generated_at', now()
  );
end $$;
grant execute on function fitma_my_report(text,text) to anon, authenticated;

-- Daily sync upsert: the sync job calls this with the sync_key + rows.
create or replace function fitma_sync_upsert(p_key text, p_members jsonb, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ok boolean; n int:=0;
begin
  select exists(select 1 from fitma_settings where key='sync_key' and value=p_key) into ok;
  if not ok then return jsonb_build_object('error','unauthorized'); end if;
  -- members (optional)
  if p_members is not null then
    insert into fitma_members(webwork_id,name,email,role,target_minutes)
    select (x->>'webwork_id')::bigint, x->>'name', x->>'email', x->>'role', nullif(x->>'target_minutes','')::int
    from jsonb_array_elements(p_members) x
    on conflict (webwork_id) do update set name=excluded.name;
  end if;
  insert into fitma_attendance(webwork_id,work_date,start_time,end_time,worked_minutes,activity_pct,status,is_late,is_left_early,working_day)
  select (x->>'webwork_id')::bigint,(x->>'work_date')::date,x->>'start_time',x->>'end_time',
         coalesce((x->>'worked_minutes')::int,0),nullif(x->>'activity_pct','')::int,x->>'status',
         coalesce((x->>'is_late')::boolean,false),coalesce((x->>'is_left_early')::boolean,false),coalesce((x->>'working_day')::boolean,true)
  from jsonb_array_elements(p_rows) x
  on conflict (webwork_id,work_date) do update set
    start_time=excluded.start_time,end_time=excluded.end_time,worked_minutes=excluded.worked_minutes,
    activity_pct=excluded.activity_pct,status=excluded.status,is_late=excluded.is_late,
    is_left_early=excluded.is_left_early,working_day=excluded.working_day,updated_at=now();
  get diagnostics n = row_count;
  return jsonb_build_object('ok',true,'rows',n);
end $$;
grant execute on function fitma_sync_upsert(text,jsonb,jsonb) to anon, authenticated;

-- Seed: real WebWork data Nov 1-11 2026 (authoritative hours + attendance)
insert into fitma_members (webwork_id,name,email,role,target_minutes) values
(427381,'Aadhil Ahamed','meaadhilahamed@gmail.com','intern',240),
(417536,'Ashfa Ahamed','ashfa.ahmadh@gmail.com','founder',null),
(417810,'Azri Riyaz','azririyas.lk@gmail.com','senior',240),
(407305,'Hasan Thaslim','hasanthaslim147@gmail.com','founder',null),
(427903,'Safiyya Jaufer','safiyyajaufer@gmail.com','intern',240),
(428510,'Shadhir Aamir',null,'intern',180),
(417534,'Info Fitma','info.fitma@gmail.com','admin',null)
on conflict (webwork_id) do update set name=excluded.name,email=excluded.email,role=excluded.role,target_minutes=excluded.target_minutes;

insert into fitma_attendance (webwork_id,work_date,start_time,end_time,worked_minutes,activity_pct,status,is_late,is_left_early,working_day) values
(417810,'2026-11-02','08:57','14:06',250,0,'All good',false,false,true),
(427381,'2026-11-02','09:01','14:01',241,58,'All good',false,false,true),
(427903,'2026-11-02','08:58','14:06',259,100,'All good',false,false,true),
(428510,'2026-11-02',null,null,170,null,'Tracked',false,false,true),
(407305,'2026-11-03','16:53','21:19',218,46,'Late',true,false,true),
(417536,'2026-11-03','09:00','10:49',109,0,'Left early, Tracked less',false,true,true),
(417810,'2026-11-03','14:14','22:35',245,0,'Late',true,false,true),
(427381,'2026-11-03','09:00','14:00',240,45,'All good',false,false,true),
(427903,'2026-11-03','08:55','14:08',264,79,'All good',false,false,true),
(428510,'2026-11-03',null,null,180,null,'Tracked',false,false,true),
(417536,'2026-11-04','09:00','11:26',146,0,'Left early, Tracked less',false,true,true),
(417810,'2026-11-04','09:01','14:23',264,0,'All good',false,false,true),
(427381,'2026-11-04','10:00','15:02',243,80,'Late',true,false,true),
(427903,'2026-11-04','12:56','19:37',257,100,'Late',true,false,true),
(428510,'2026-11-04',null,null,153,null,'Tracked',false,false,true),
(407305,'2026-11-05','19:10','21:36',133,45,'Late, Tracked less',true,false,true),
(417536,'2026-11-05','09:00','12:30',210,0,'All good',false,false,true),
(417810,'2026-11-05','09:46','14:47',245,0,'Late',true,false,true),
(427381,'2026-11-05','09:00','14:01',242,73,'All good',false,false,true),
(427903,'2026-11-05','08:59','14:06',256,100,'All good',false,false,true),
(407305,'2026-11-06','06:09','21:57',262,41,'All good',false,false,true),
(417536,'2026-11-06','09:00','14:38',338,0,'All good',false,false,true),
(417810,'2026-11-06','09:33','22:10',240,0,'Late',true,false,true),
(427381,'2026-11-06','09:00','21:31',242,67,'All good',false,false,true),
(427903,'2026-11-06','08:57','17:35',260,100,'All good',false,false,true),
(407305,'2026-11-07','11:34','20:34',254,34,'Late',true,false,false),
(417536,'2026-11-07','09:00','17:15',495,0,'All good',false,false,false),
(417810,'2026-11-09','09:00','14:02',243,0,'All good',false,false,true),
(427381,'2026-11-09','09:00','14:01',243,69,'All good',false,false,true),
(427903,'2026-11-09','08:59','14:08',259,100,'All good',false,false,true),
(407305,'2026-11-10','09:54','19:45',314,24,'Late',true,false,true),
(417536,'2026-11-10','09:00','16:10',430,0,'All good',false,false,true),
(417810,'2026-11-10','08:59','14:22',248,0,'All good',false,false,true),
(427381,'2026-11-10','09:00','14:01',242,62,'All good',false,false,true),
(427903,'2026-11-10','08:55','14:07',263,100,'All good',false,false,true),
(407305,'2026-11-11','14:14','20:00',157,39,'Late, Tracked less',true,false,true),
(417810,'2026-11-11','09:00','14:01',243,0,'All good',false,false,true),
(427381,'2026-11-11','09:00','14:01',242,76,'All good',false,false,true),
(427903,'2026-11-11','08:55','14:08',264,100,'All good',false,false,true)
on conflict (webwork_id,work_date) do update set start_time=excluded.start_time,end_time=excluded.end_time,worked_minutes=excluded.worked_minutes,activity_pct=excluded.activity_pct,status=excluded.status,is_late=excluded.is_late,is_left_early=excluded.is_left_early,working_day=excluded.working_day,updated_at=now();
select 'internal schema + seed ready' as status;
