-- Upgrade after automation.sql and social-v2.sql. Does not delete product/content data.
begin;
alter table public.affiliate_automation_settings add column if not exists morning_start integer not null default 7;
alter table public.affiliate_automation_settings add column if not exists morning_end integer not null default 12;
alter table public.affiliate_automation_settings add column if not exists evening_start integer not null default 18;
alter table public.affiliate_automation_settings add column if not exists evening_end integer not null default 23;
alter table public.affiliate_automation_settings drop constraint if exists automation_hours_valid;
alter table public.affiliate_automation_settings add constraint automation_hours_valid check(morning_start>=0 and morning_start<morning_end and morning_end<=12 and evening_start>=12 and evening_start<evening_end and evening_end<=24);
create table if not exists public.affiliate_product_post_slots (
 owner_id uuid not null references auth.users(id) on delete cascade,
 product_id uuid not null references public.affiliate_products(id) on delete cascade,
 local_day date not null,
 period text not null check(period in ('morning','evening')),
 post_id uuid references public.affiliate_content_posts(id) on delete set null,
 created_at timestamptz not null default now(),
 primary key(owner_id,product_id,local_day,period)
);
create table if not exists public.affiliate_automation_errors (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 job_id uuid references public.affiliate_automation_jobs(id) on delete set null,
 channel text,stage text not null,kind text not null,message text not null,
 http_status integer,error_code integer,error_subcode integer,advice text not null,
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '8 hours'
);
create index if not exists automation_errors_expiry on public.affiliate_automation_errors(expires_at);
create index if not exists automation_errors_owner_time on public.affiliate_automation_errors(owner_id,created_at desc);
alter table public.affiliate_product_post_slots enable row level security;
alter table public.affiliate_automation_errors enable row level security;
revoke all on public.affiliate_product_post_slots,public.affiliate_automation_errors from anon,authenticated;
grant all on public.affiliate_product_post_slots,public.affiliate_automation_errors to service_role;

create or replace function public.affiliate_posting_period(p_at timestamptz,p_ms integer,p_me integer,p_es integer,p_ee integer)
returns text language sql immutable as $$
 select case when extract(hour from p_at at time zone 'Asia/Ho_Chi_Minh')>=p_ms and extract(hour from p_at at time zone 'Asia/Ho_Chi_Minh')<p_me then 'morning'
 when extract(hour from p_at at time zone 'Asia/Ho_Chi_Minh')>=p_es and extract(hour from p_at at time zone 'Asia/Ho_Chi_Minh')<p_ee then 'evening' else null end;
$$;
create or replace function public.reserve_affiliate_product_post(p_owner uuid,p_post uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare product uuid;period_value text;day_value date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;cfg public.affiliate_automation_settings;inserted uuid;
begin
 select product_id into product from public.affiliate_content_posts where id=p_post and owner_id=p_owner;
 if product is null then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||product::text||day_value::text,0));
 select * into cfg from public.affiliate_automation_settings where owner_id=p_owner;
 period_value:=public.affiliate_posting_period(now(),coalesce(cfg.morning_start,7),coalesce(cfg.morning_end,12),coalesce(cfg.evening_start,18),coalesce(cfg.evening_end,23));
 if period_value is null then return false; end if;
 -- Existing posts also count, including posts published before this migration.
 if exists(select 1 from public.affiliate_content_posts where owner_id=p_owner and product_id=product and id<>p_post and status in ('published','publishing','unknown') and (coalesce(published_at,created_at) at time zone 'Asia/Ho_Chi_Minh')::date=day_value and case when extract(hour from coalesce(published_at,created_at) at time zone 'Asia/Ho_Chi_Minh')<12 then 'morning' else 'evening' end=period_value) then return false; end if;
 insert into public.affiliate_product_post_slots(owner_id,product_id,local_day,period,post_id) values(p_owner,product,day_value,period_value,p_post) on conflict do nothing returning post_id into inserted;
 if inserted is not null then return true; end if;
 return exists(select 1 from public.affiliate_product_post_slots where owner_id=p_owner and product_id=product and local_day=day_value and period=period_value and post_id=p_post);
end;$$;
-- Database guard also covers manual publishing and concurrent/older deployments.
create or replace function public.guard_affiliate_product_post() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.reserve_affiliate_product_post(new.owner_id,new.id) then raise exception 'Product morning/evening posting limit reached or outside posting hours'; end if;
 return new;
end;$$;
drop trigger if exists affiliate_product_post_guard on public.affiliate_content_posts;
create trigger affiliate_product_post_guard before update of status on public.affiliate_content_posts for each row when (new.status='publishing' and old.status is distinct from new.status) execute function public.guard_affiliate_product_post();
create or replace function public.eligible_affiliate_products(p_owner uuid)
returns setof uuid language sql security definer set search_path=public,pg_temp as $$
 with config as(select coalesce((select morning_start from public.affiliate_automation_settings where owner_id=p_owner),7) ms,coalesce((select morning_end from public.affiliate_automation_settings where owner_id=p_owner),12) me,coalesce((select evening_start from public.affiliate_automation_settings where owner_id=p_owner),18) es,coalesce((select evening_end from public.affiliate_automation_settings where owner_id=p_owner),23) ee),
 clock as(select (now() at time zone 'Asia/Ho_Chi_Minh')::date d,public.affiliate_posting_period(now(),ms,me,es,ee) period from config)
 select p.id from public.affiliate_products p cross join clock c where p.owner_id=p_owner and p.status='ready' and c.period is not null
 and not exists(select 1 from public.affiliate_product_post_slots s where s.owner_id=p_owner and s.product_id=p.id and s.local_day=c.d and s.period=c.period)
 and not exists(select 1 from public.affiliate_content_posts x where x.owner_id=p_owner and x.product_id=p.id and x.status in ('published','publishing','unknown') and (coalesce(x.published_at,x.created_at) at time zone 'Asia/Ho_Chi_Minh')::date=c.d and case when extract(hour from coalesce(x.published_at,x.created_at) at time zone 'Asia/Ho_Chi_Minh')<12 then 'morning' else 'evening' end=c.period)
 limit 1001;
$$;
create or replace function public.cleanup_affiliate_automation()
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 delete from public.affiliate_automation_errors where expires_at<=now();
 -- Error details are never duplicated in the permanent job summary.
 update public.affiliate_automation_jobs set message='Lượt lỗi đã hết hạn chi tiết (8 giờ).' where status='failed' and coalesce(finished_at,created_at)<=now()-interval '8 hours' and message<>'Lượt lỗi đã hết hạn chi tiết (8 giờ).';
 delete from public.affiliate_automation_jobs where created_at<now()-interval '48 hours' and status<>'running';
 delete from public.affiliate_product_post_slots where local_day<(now() at time zone 'Asia/Ho_Chi_Minh')::date-1;
end;$$;
revoke all on function public.reserve_affiliate_product_post(uuid,uuid),public.eligible_affiliate_products(uuid),public.cleanup_affiliate_automation(),public.guard_affiliate_product_post() from public,anon,authenticated;
grant execute on function public.reserve_affiliate_product_post(uuid,uuid),public.eligible_affiliate_products(uuid),public.cleanup_affiliate_automation() to service_role;
commit;
