-- NẾP · Run once in the SQL Editor of your existing Supabase project.
-- This creates only namespaced tables and the affiliate-product-images bucket.
begin;

create table if not exists public.affiliate_products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 240),
  category text not null default 'Khác' check (category in ('Sữa tắm','Kem đánh răng','Sữa rửa mặt','Nước giặt','Khẩu trang','Khác')),
  description text not null default '',
  affiliate_url text not null check (affiliate_url ~ '^https://'),
  source_url text not null default '',
  shop_name text not null default '',
  variant text not null default '',
  price numeric(14,0) check (price is null or price >= 0),
  commission_rate numeric(5,2) check (commission_rate is null or commission_rate between 0 and 100),
  status text not null default 'draft' check (status in ('draft','ready','archived')),
  notes text not null default '',
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (owner_id, affiliate_url)
);

create table if not exists public.affiliate_product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  storage_path text not null unique check (storage_path like '%.webp'),
  original_name text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 2097152),
  original_bytes bigint not null check (original_bytes > 0),
  width integer not null check (width > 0 and width <= 2200),
  height integer not null check (height > 0 and height <= 2200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (product_id, owner_id) references public.affiliate_products(id, owner_id) on delete cascade,
  check (split_part(storage_path, '/', 1) = owner_id::text),
  check (split_part(storage_path, '/', 2) = product_id::text)
);

create index if not exists affiliate_products_owner_updated on public.affiliate_products(owner_id, updated_at desc);
create index if not exists affiliate_images_product on public.affiliate_product_images(product_id, owner_id);

create or replace function public.affiliate_set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists affiliate_products_updated on public.affiliate_products;
create trigger affiliate_products_updated before update on public.affiliate_products for each row execute function public.affiliate_set_updated_at();

alter table public.affiliate_products enable row level security;
alter table public.affiliate_product_images enable row level security;
revoke all on public.affiliate_products, public.affiliate_product_images from anon;
grant select, insert, update, delete on public.affiliate_products, public.affiliate_product_images to authenticated;

drop policy if exists "affiliate_products_owner" on public.affiliate_products;
create policy "affiliate_products_owner" on public.affiliate_products for all to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "affiliate_images_owner" on public.affiliate_product_images;
create policy "affiliate_images_owner" on public.affiliate_product_images for all to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('affiliate-product-images','affiliate-product-images',false,2097152,array['image/webp'])
on conflict (id) do update set public=false, file_size_limit=2097152, allowed_mime_types=array['image/webp'];

drop policy if exists "affiliate_storage_read" on storage.objects;
create policy "affiliate_storage_read" on storage.objects for select to authenticated
using (bucket_id = 'affiliate-product-images' and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text);
drop policy if exists "affiliate_storage_insert" on storage.objects;
create policy "affiliate_storage_insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'affiliate-product-images'
  and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
  and lower(storage.extension(storage.objects.name)) = 'webp'
  and exists (select 1 from public.affiliate_products p where p.id::text = (storage.foldername(storage.objects.name))[2] and p.owner_id = (select auth.uid()))
);
drop policy if exists "affiliate_storage_delete" on storage.objects;
create policy "affiliate_storage_delete" on storage.objects for delete to authenticated
using (bucket_id = 'affiliate-product-images' and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text);

commit;
