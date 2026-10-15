begin;
create table if not exists public.affiliate_site_settings (
 id integer primary key check(id=1),
 value jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.affiliate_site_settings enable row level security;
revoke all on public.affiliate_site_settings from anon,authenticated;
grant select on public.affiliate_site_settings to anon,authenticated;
grant all on public.affiliate_site_settings to service_role;
drop policy if exists public_site_settings_read on public.affiliate_site_settings;
create policy public_site_settings_read on public.affiliate_site_settings for select to anon,authenticated using(true);
-- PUBLIC CONTENT ONLY. Never store any key/token here. Writes require the server admin check.
commit;
