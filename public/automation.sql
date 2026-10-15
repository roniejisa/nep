begin;
create table if not exists public.affiliate_automation_settings (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default false,
 channels jsonb not null default '["facebook","threads"]',
 targets jsonb not null default '{}',
 provider text not null default 'gemini', model text not null default '',
 copy_length text not null default 'tiny' check(copy_length in ('tiny','short')),
 daily_limit integer not null default 24 check(daily_limit between 1 and 24),
 updated_at timestamptz not null default now()
);
create table if not exists public.affiliate_automation_jobs (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 slot timestamptz not null,
 status text not null default 'running' check(status in ('running','done','failed','skipped')),
 product_id uuid references public.affiliate_products(id) on delete set null,
 channel text, post_id uuid references public.affiliate_content_posts(id) on delete set null,
 message text not null default '', created_at timestamptz not null default now(), finished_at timestamptz,
 unique(owner_id,slot)
);
create or replace function public.claim_affiliate_automation(p_owner uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg public.affiliate_automation_settings; job uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('affiliate_automation:'||p_owner::text,0));
 select * into cfg from public.affiliate_automation_settings where owner_id=p_owner for update;
 if not found or not cfg.enabled then return null; end if;
 if exists(select 1 from public.affiliate_automation_jobs where owner_id=p_owner and status='running' and created_at>now()-interval '10 minutes') then return null; end if;
 if (select count(*) from public.affiliate_automation_jobs where owner_id=p_owner and created_at>=date_trunc('day',now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh') >=cfg.daily_limit then return null; end if;
 insert into public.affiliate_automation_jobs(owner_id,slot) values(p_owner,date_trunc('hour',now())) on conflict(owner_id,slot) do nothing returning id into job;
 return job;
end;$$;
revoke all on function public.claim_affiliate_automation(uuid) from public,anon,authenticated;
grant execute on function public.claim_affiliate_automation(uuid) to service_role;
alter table public.affiliate_automation_settings enable row level security;
alter table public.affiliate_automation_jobs enable row level security;
revoke all on public.affiliate_automation_settings,public.affiliate_automation_jobs from anon,authenticated;
grant all on public.affiliate_automation_settings,public.affiliate_automation_jobs to service_role;
create index if not exists affiliate_automation_recent on public.affiliate_automation_jobs(owner_id,created_at desc);
commit;
