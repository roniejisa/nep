-- Upgrade after automation-flex.sql. Legacy window schedules are preserved until saved.
begin;
create or replace function public.valid_affiliate_schedule(v jsonb) returns boolean language plpgsql immutable as $$
declare m integer;previous integer:=-100;first_value integer;last_value integer;
begin
 if jsonb_typeof(v)<>'array' or jsonb_array_length(v) not between 1 and 24 then return false;end if;
 if exists(select 1 from jsonb_array_elements_text(v) t where t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') or (select count(distinct t) from jsonb_array_elements_text(v) t)<>jsonb_array_length(v) then return false;end if;
 for m in select split_part(t,':',1)::integer*60+split_part(t,':',2)::integer from jsonb_array_elements_text(v) t order by 1 loop
  if m-previous<15 then return false;end if;if first_value is null then first_value:=m;end if;previous:=m;last_value:=m;
 end loop;
 return jsonb_array_length(v)=1 or 1440-last_value+first_value>=15;
end;$$;
alter table public.affiliate_automation_settings add column if not exists schedule_mode text not null default 'windows' check(schedule_mode in ('windows','times'));
alter table public.affiliate_automation_settings add column if not exists schedule_times jsonb not null default '[]';
alter table public.affiliate_automation_settings drop constraint if exists affiliate_schedule_times_valid;
alter table public.affiliate_automation_settings add constraint affiliate_schedule_times_valid check(schedule_mode='windows' or public.valid_affiliate_schedule(schedule_times));
create or replace function public.due_affiliate_slot(p_owner uuid,p_at timestamptz default now()) returns timestamptz language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg public.affiliate_automation_settings;local_time timestamp:=p_at at time zone 'Asia/Ho_Chi_Minh';result timestamptz;period_value text;start_minute integer;
begin
 select * into cfg from public.affiliate_automation_settings where owner_id=p_owner;
 if not found or not cfg.enabled then return null;end if;
 if cfg.schedule_mode='times' then
  select max((local_time::date+t::time) at time zone 'Asia/Ho_Chi_Minh') into result from jsonb_array_elements_text(cfg.schedule_times) t where (local_time::date+t::time) at time zone 'Asia/Ho_Chi_Minh'<=p_at and (local_time::date+t::time) at time zone 'Asia/Ho_Chi_Minh'>p_at-interval '5 minutes';
  return result;
 end if;
 period_value:=public.affiliate_posting_period(p_at,cfg.morning_start,cfg.morning_end,cfg.evening_start,cfg.evening_end);
 if period_value is null then return null;end if;
 start_minute:=round(case when period_value='morning' then cfg.morning_start*60 else cfg.evening_start*60 end);
 if mod(extract(hour from local_time)::integer*60+extract(minute from local_time)::integer-start_minute,60)<>0 then return null;end if;
 return date_trunc('hour',p_at);
end;$$;
create or replace function public.claim_affiliate_automation(p_owner uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg public.affiliate_automation_settings;job uuid;due timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended('affiliate_automation:'||p_owner::text,0));
 select * into cfg from public.affiliate_automation_settings where owner_id=p_owner for update;
 if not found or not cfg.enabled then return null;end if;
 due:=public.due_affiliate_slot(p_owner);if due is null then return null;end if;
 if exists(select 1 from public.affiliate_automation_jobs where owner_id=p_owner and status='running' and created_at>now()-interval '10 minutes') then return null;end if;
 if (select count(*) from public.affiliate_automation_jobs where owner_id=p_owner and created_at>=date_trunc('day',now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh')>=cfg.daily_limit then return null;end if;
 insert into public.affiliate_automation_jobs(owner_id,slot) values(p_owner,due) on conflict(owner_id,slot) do nothing returning id into job;
 return job;
end;$$;
create or replace function public.reserve_affiliate_product_post(p_owner uuid,p_post uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare product uuid;period_value text;day_value date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;cfg public.affiliate_automation_settings;inserted uuid;
begin
 select product_id into product from public.affiliate_content_posts where id=p_post and owner_id=p_owner;
 if product is null then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||product::text||day_value::text,0));
 select * into cfg from public.affiliate_automation_settings where owner_id=p_owner;
 period_value:=case when cfg.schedule_mode='times' then case when extract(hour from now() at time zone 'Asia/Ho_Chi_Minh')<12 then 'morning' else 'evening' end else public.affiliate_posting_period(now(),coalesce(cfg.morning_start,7),coalesce(cfg.morning_end,12),coalesce(cfg.evening_start,18),coalesce(cfg.evening_end,23)) end;
 if period_value is null then return false; end if;
 -- Existing posts also count, including posts published before this migration.
 if exists(select 1 from public.affiliate_content_posts where owner_id=p_owner and product_id=product and id<>p_post and status in ('published','publishing','unknown') and (coalesce(published_at,created_at) at time zone 'Asia/Ho_Chi_Minh')::date=day_value and case when extract(hour from coalesce(published_at,created_at) at time zone 'Asia/Ho_Chi_Minh')<12 then 'morning' else 'evening' end=period_value) then return false; end if;
 insert into public.affiliate_product_post_slots(owner_id,product_id,local_day,period,post_id) values(p_owner,product,day_value,period_value,p_post) on conflict do nothing returning post_id into inserted;
 if inserted is not null then return true; end if;
 return exists(select 1 from public.affiliate_product_post_slots where owner_id=p_owner and product_id=product and local_day=day_value and period=period_value and post_id=p_post);
end;$$;
create or replace function public.eligible_affiliate_products(p_owner uuid)
returns setof uuid language sql security definer set search_path=public,pg_temp as $$
 with config as(select coalesce((select morning_start from public.affiliate_automation_settings where owner_id=p_owner),7) ms,coalesce((select morning_end from public.affiliate_automation_settings where owner_id=p_owner),12) me,coalesce((select evening_start from public.affiliate_automation_settings where owner_id=p_owner),18) es,coalesce((select evening_end from public.affiliate_automation_settings where owner_id=p_owner),23) ee),
 clock as(select (now() at time zone 'Asia/Ho_Chi_Minh')::date d,case when (select schedule_mode from public.affiliate_automation_settings where owner_id=p_owner)='times' then case when extract(hour from now() at time zone 'Asia/Ho_Chi_Minh')<12 then 'morning' else 'evening' end else public.affiliate_posting_period(now(),ms,me,es,ee) end period from config)
 select p.id from public.affiliate_products p cross join clock c where p.owner_id=p_owner and p.status='ready' and c.period is not null
 and not exists(select 1 from public.affiliate_product_post_slots s where s.owner_id=p_owner and s.product_id=p.id and s.local_day=c.d and s.period=c.period)
 and not exists(select 1 from public.affiliate_content_posts x where x.owner_id=p_owner and x.product_id=p.id and x.status in ('published','publishing','unknown') and (coalesce(x.published_at,x.created_at) at time zone 'Asia/Ho_Chi_Minh')::date=c.d and case when extract(hour from coalesce(x.published_at,x.created_at) at time zone 'Asia/Ho_Chi_Minh')<12 then 'morning' else 'evening' end=c.period)
 limit 1001;
$$;

revoke all on function public.due_affiliate_slot(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.due_affiliate_slot(uuid,timestamptz) to service_role;
commit;
