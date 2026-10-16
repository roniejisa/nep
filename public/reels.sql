-- Run AFTER automation-unrestricted.sql. Existing posts/schedules remain feed.
begin;
create table if not exists public.affiliate_product_videos(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 product_id uuid not null,
 storage_path text not null unique,
 original_name text not null check(length(original_name) between 1 and 240),
 size_bytes bigint not null check(size_bytes between 1 and 52428800),
 duration double precision not null check(duration between 4 and 60),
 width integer not null check(width>=540),height integer not null check(height>=960),
 approved boolean not null default false,created_at timestamptz not null default now(),
 constraint reel_video_aspect check(abs(width::double precision/height-0.5625)<=0.015),
 foreign key(product_id,owner_id) references public.affiliate_products(id,owner_id) on delete cascade,
 constraint reel_video_path check(storage_path=owner_id::text||'/'||product_id::text||'/'||id::text||'.mp4')
);
create index if not exists product_videos_owner on public.affiliate_product_videos(owner_id,product_id);
alter table public.affiliate_product_videos enable row level security;
revoke all on public.affiliate_product_videos from anon,authenticated;
grant select,insert,update,delete on public.affiliate_product_videos to authenticated;
grant all on public.affiliate_product_videos to service_role;
drop policy if exists product_videos_owner on public.affiliate_product_videos;
create policy product_videos_owner on public.affiliate_product_videos for all to authenticated
 using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('affiliate-product-videos','affiliate-product-videos',false,52428800,array['video/mp4'])
 on conflict(id) do update set public=false,file_size_limit=52428800,allowed_mime_types=array['video/mp4'];
drop policy if exists reel_video_read on storage.objects;
create policy reel_video_read on storage.objects for select to authenticated using(bucket_id='affiliate-product-videos' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists reel_video_insert on storage.objects;
create policy reel_video_insert on storage.objects for insert to authenticated with check(
 bucket_id='affiliate-product-videos' and (storage.foldername(storage.objects.name))[1]=(select auth.uid())::text
 and lower(storage.extension(storage.objects.name))='mp4'
 and exists(select 1 from public.affiliate_products p where p.id::text=(storage.foldername(storage.objects.name))[2] and p.owner_id=(select auth.uid())));
drop policy if exists reel_video_delete on storage.objects;
create policy reel_video_delete on storage.objects for delete to authenticated using(bucket_id='affiliate-product-videos' and (storage.foldername(name))[1]=(select auth.uid())::text);
alter table public.affiliate_content_posts add column if not exists post_format text not null default 'feed' check(post_format in('feed','reel'));
-- No FK: deleting a product/video must preserve historical published post records.
alter table public.affiliate_content_posts add column if not exists video_id uuid;
alter table public.affiliate_content_posts drop constraint if exists reel_channel_valid;
alter table public.affiliate_content_posts add constraint reel_channel_valid check(post_format<>'reel' or channel in('facebook','instagram'));
alter table public.affiliate_automation_settings add column if not exists format_mode text not null default 'feed' check(format_mode in('feed','reel','mixed'));
alter table public.affiliate_automation_settings add column if not exists slot_formats jsonb not null default '{}';
alter table public.affiliate_automation_settings drop constraint if exists reel_slots_object;
alter table public.affiliate_automation_settings add constraint reel_slots_object check(jsonb_typeof(slot_formats)='object');
commit;
