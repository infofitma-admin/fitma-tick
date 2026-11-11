-- Keep screenshot storage inside the free tier: delete screenshots older than 60 days, daily.
create extension if not exists pg_cron;

create or replace function cleanup_old_screenshots() returns void
  language plpgsql security definer set search_path = public as $$
begin
  delete from storage.objects where bucket_id = 'screenshots' and created_at < now() - interval '60 days';
  delete from screenshots where captured_at < now() - interval '60 days';
end $$;

do $$ begin perform cron.unschedule('fitma-screenshot-cleanup'); exception when others then null; end $$;
select cron.schedule('fitma-screenshot-cleanup','0 3 * * *', $$select public.cleanup_old_screenshots();$$);
select jobname, schedule, active from cron.job where jobname='fitma-screenshot-cleanup';
