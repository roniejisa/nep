begin;
create table if not exists public.affiliate_instagram_oauth_states (
 state_hash text primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null,
 used boolean not null default false
);
create table if not exists public.affiliate_instagram_connections (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 instagram_user_id text not null check(instagram_user_id ~ '^[0-9]+$'),
 username text not null,
 access_token_encrypted text not null,
 expires_at timestamptz not null,
 issued_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.affiliate_instagram_oauth_states enable row level security;
alter table public.affiliate_instagram_connections enable row level security;
revoke all on public.affiliate_instagram_oauth_states,public.affiliate_instagram_connections from anon,authenticated;
grant all on public.affiliate_instagram_oauth_states,public.affiliate_instagram_connections to service_role;
-- Tokens are encrypted before insert. There are no browser read/write policies.
commit;
