-- Run automation.sql, automation-controls.sql AND automation-flex.sql first. Create Vault secret nep_cron_secret via Dashboard;
-- value must equal CRON_SECRET on Vercel (at least 32 random characters).
-- No credentials should be inserted into this source file.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$ begin
 if not exists(select 1 from vault.decrypted_secrets where name='nep_cron_secret' and length(decrypted_secret)>=32) then
 raise exception 'Create Vault secret nep_cron_secret (same value as CRON_SECRET on Vercel) first';
 end if;
end $$;
-- Calling schedule with the same name updates that job, instead of duplicating it.
select cron.schedule('nep-hourly-publish','* * * * *',$job$
 select net.http_post(
  url := 'https://nep-hp.vercel.app/api/automation/cron/',
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='nep_cron_secret' limit 1)),
  body := '{}'::jsonb,
  timeout_milliseconds := 130000
 ) where exists (
 select 1 from public.affiliate_automation_settings s
 cross join lateral (select public.affiliate_posting_period(now(),s.morning_start,s.morning_end,s.evening_start,s.evening_end) period) w
 where s.enabled and w.period is not null and mod((extract(hour from now() at time zone 'Asia/Ho_Chi_Minh')*60+extract(minute from now() at time zone 'Asia/Ho_Chi_Minh'))::integer-round((case when w.period='morning' then s.morning_start else s.evening_start end)*60)::integer,60)=0
 );
$job$);
-- To remove the scheduler later: select cron.unschedule('nep-hourly-publish');
-- To pause publishing: use the off button at /automation/ (no SQL needed).

-- Runs independently of publishing's on/off state. Expired errors disappear from UI
-- at exactly 8h; physical deletion occurs on the next minute while Cron is active.
select cron.schedule('nep-cleanup-errors','* * * * *',$cleanup$
 select public.cleanup_affiliate_automation();
 delete from cron.job_run_details where jobid in(select jobid from cron.job where jobname in('nep-hourly-publish','nep-cleanup-errors')) and end_time<now()-interval '8 hours';
$cleanup$);
