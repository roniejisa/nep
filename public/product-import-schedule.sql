-- Run product-import.sql first. Reuses the existing Vault secret; does not change publishing.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$ begin
 if not exists(select 1 from vault.decrypted_secrets where name='nep_cron_secret' and length(decrypted_secret)>=32) then raise exception 'Create nep_cron_secret matching CRON_SECRET first';end if;
end $$;
select cron.schedule('nep-product-images','* * * * *',$job$
 select net.http_post(
  url:='https://nep-hp.vercel.app/api/product-import/images/',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='nep_cron_secret' limit 1)),
  body:='{}'::jsonb,timeout_milliseconds:=60000
 ) where exists(select 1 from public.affiliate_product_image_jobs where status='pending' or status='running' and claimed_at<now()-interval '3 minutes');
 update public.affiliate_product_image_jobs set error=null where error is not null and updated_at<now()-interval '8 hours';
 delete from cron.job_run_details where jobid in(select jobid from cron.job where jobname='nep-product-images') and end_time<now()-interval '8 hours';
$job$);
-- Disable later: select cron.unschedule('nep-product-images');
