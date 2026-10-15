begin;
create table if not exists public.affiliate_content_runs (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'running' check (status in ('running','done','failed')),
 tokens integer,
 created_at timestamptz not null default now()
);
create unique index if not exists affiliate_content_one_running on public.affiliate_content_runs(owner_id) where status='running';
create table if not exists public.affiliate_content_posts (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 product_id uuid references public.affiliate_products(id) on delete set null,
 run_id uuid references public.affiliate_content_runs(id),
 channel text not null check (channel in ('facebook','threads')),
 body text not null,
 review text not null default '',
 status text not null default 'draft' check (status in ('draft','publishing','published','unknown')),
 target_id text,
 external_id text,
 container_id text,
 created_at timestamptz not null default now(),
 published_at timestamptz
);
alter table public.affiliate_content_runs enable row level security;
alter table public.affiliate_content_posts enable row level security;
revoke all on public.affiliate_content_runs, public.affiliate_content_posts from anon, authenticated;
grant select on public.affiliate_content_runs, public.affiliate_content_posts to authenticated;
grant all on public.affiliate_content_runs, public.affiliate_content_posts to service_role;
drop policy if exists content_runs_read_own on public.affiliate_content_runs;
create policy content_runs_read_own on public.affiliate_content_runs for select to authenticated using (owner_id=(select auth.uid()));
drop policy if exists content_posts_read_own on public.affiliate_content_posts;
create policy content_posts_read_own on public.affiliate_content_posts for select to authenticated using (owner_id=(select auth.uid()));
-- Mutations are server-only: a browser cannot bypass approval/claim logic through REST.
commit;
