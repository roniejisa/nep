-- Run automation.sql first. Create Vault secret nep_cron_secret via Dashboard;
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
select cron.schedule('nep-hourly-publish','0 * * * *',$job$
 select net.http_post(
  url := 'https://nep-hp.vercel.app/api/automation/cron/',
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='nep_cron_secret' limit 1)),
  body := '{}'::jsonb,
  timeout_milliseconds := 130000
 );
$job$);
-- To remove the scheduler later: select cron.unschedule('nep-hourly-publish');
-- To pause publishing: use the off button at /automation/ (no SQL needed).
