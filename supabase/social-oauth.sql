begin;
create table if not exists public.affiliate_social_oauth_states (
 state_hash text primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(provider in ('facebook','threads')),
 expires_at timestamptz not null,
 used boolean not null default false
);
create table if not exists public.affiliate_social_connections (
 owner_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(provider in ('facebook','threads')),
 actor_id text not null default '',
 display_name text not null default '',
 token_encrypted text,
 active boolean not null default true,
 expires_at timestamptz,
 issued_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(owner_id,provider),
 check(not active or (actor_id ~ '^[0-9]+$' and token_encrypted is not null))
);
create table if not exists public.affiliate_facebook_page_choices (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 pages_encrypted text not null,
 expires_at timestamptz not null,
 updated_at timestamptz not null default now()
);
alter table public.affiliate_social_oauth_states enable row level security;
alter table public.affiliate_social_connections enable row level security;
alter table public.affiliate_facebook_page_choices enable row level security;
revoke all on public.affiliate_social_oauth_states,public.affiliate_social_connections,public.affiliate_facebook_page_choices from anon,authenticated;
grant all on public.affiliate_social_oauth_states,public.affiliate_social_connections,public.affiliate_facebook_page_choices to service_role;
commit;
