-- Internal dashboard v2: per-employee login + hours hidden from employees
alter table fitma_members add column if not exists pin text;

-- employee login emails + personal PINs (their existing workspace passwords)
update fitma_members set email='azririyas.lk@gmail.com',   pin='FitmaAzri#26'    where webwork_id=417810;
update fitma_members set email='hasan.thaslim147@gmail.com',pin='FitmaHasan#26'  where webwork_id=407305;
update fitma_members set email='ashfa.ahmadh@gmail.com',    pin='FitmaAshfa#26'  where webwork_id=417536;
update fitma_members set email='meaadhilahamed@gmail.com',  pin='FitmaAadhil#26' where webwork_id=427381;
update fitma_members set email='shadhiraamir4@gmail.com',   pin='FitmaSadhir#26' where webwork_id=428510;
update fitma_members set email='safiyyajaufer@gmail.com',   pin='FitmaSafiyya#26'where webwork_id=427903;

-- Employee self report: email + own PIN (or admin PIN). HOURS ARE NOT RETURNED.
create or replace function fitma_my_report(p_email text, p_pin text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare mid bigint; mrole text; mname text; mpin text; is_admin boolean;
begin
  select exists(select 1 from fitma_settings where key='admin_pin' and value=p_pin) into is_admin;
  select webwork_id, role, name, pin into mid, mrole, mname, mpin
    from fitma_members where lower(email)=lower(p_email);
  if mid is null then return jsonb_build_object('error','not_found'); end if;
  if not (is_admin or (mpin is not null and mpin = p_pin)) then
    return jsonb_build_object('error','unauthorized');
  end if;
  return jsonb_build_object(
    'member', jsonb_build_object('name',mname,'role',mrole),
    -- deliberately omits worked_minutes and end_time: employees never see hours/duration
    'attendance', (select coalesce(jsonb_agg(jsonb_build_object(
        'work_date',a.work_date,'start_time',a.start_time,'status',a.status,
        'is_late',a.is_late,'is_left_early',a.is_left_early,'activity_pct',a.activity_pct,'working_day',a.working_day
      ) order by a.work_date),'[]'::jsonb) from fitma_attendance a where a.webwork_id=mid),
    'generated_at', now()
  );
end $$;
grant execute on function fitma_my_report(text,text) to anon, authenticated;

select 'internal v2 ready' as status;
