-- Upgrade AFTER automation-times.sql. Removes Nếp's product/day quotas only.
-- Keeps owner authorization, per-post claims, scheduler slot uniqueness and RLS.
begin;
drop trigger if exists affiliate_product_post_guard on public.affiliate_content_posts;
create or replace function public.reserve_affiliate_product_post(p_owner uuid,p_post uuid)
returns boolean language sql security definer set search_path=public,pg_temp as $$
 select exists(
   select 1 from public.affiliate_content_posts x
   join public.affiliate_products p on p.id=x.product_id and p.owner_id=x.owner_id
   where x.id=p_post and x.owner_id=p_owner and x.status='draft'
 );
$$;
create or replace function public.eligible_affiliate_products(p_owner uuid)
returns setof uuid language sql security definer set search_path=public,pg_temp as $$
 select id from public.affiliate_products where owner_id=p_owner and status='ready' limit 1001;
$$;
create or replace function public.claim_affiliate_automation(p_owner uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg public.affiliate_automation_settings;job uuid;due timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended('affiliate_automation:'||p_owner::text,0));
 select * into cfg from public.affiliate_automation_settings where owner_id=p_owner for update;
 if not found or not cfg.enabled then return null;end if;
 due:=public.due_affiliate_slot(p_owner);if due is null then return null;end if;
 if exists(select 1 from public.affiliate_automation_jobs where owner_id=p_owner and status='running' and created_at>now()-interval '10 minutes') then return null;end if;
 insert into public.affiliate_automation_jobs(owner_id,slot) values(p_owner,due) on conflict(owner_id,slot) do nothing returning id into job;
 return job;
end;$$;
alter table public.affiliate_automation_settings alter column provider set default 'gemini';
alter table public.affiliate_automation_settings alter column model set default 'gemini-3.5-flash-lite';
alter table public.affiliate_automation_settings alter column copy_length set default 'tiny';
-- Apply the requested AI defaults to existing schedules, preserving times and targets.
update public.affiliate_automation_settings set provider='gemini',model='gemini-3.5-flash-lite',copy_length='tiny',updated_at=now()
 where provider<>'gemini' or model<>'gemini-3.5-flash-lite' or copy_length<>'tiny';
-- daily_limit and historical product slots remain only for backward compatibility.
-- Neither is consulted by the replacement functions above. No posts are deleted.
revoke all on function public.reserve_affiliate_product_post(uuid,uuid),public.eligible_affiliate_products(uuid),public.claim_affiliate_automation(uuid) from public,anon,authenticated;
grant execute on function public.reserve_affiliate_product_post(uuid,uuid),public.eligible_affiliate_products(uuid),public.claim_affiliate_automation(uuid) to service_role;
commit;
