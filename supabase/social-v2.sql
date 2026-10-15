-- Run after content.sql. Preserves existing Facebook/Threads posts and products.
begin;
alter table public.affiliate_content_posts drop constraint if exists affiliate_content_posts_channel_check;
alter table public.affiliate_content_posts add constraint affiliate_content_posts_channel_check check(channel in ('facebook','threads','instagram'));
alter table public.affiliate_content_posts add column if not exists image_id uuid references public.affiliate_product_images(id) on delete set null;
alter table public.affiliate_content_posts add column if not exists provider text;
alter table public.affiliate_content_posts add column if not exists model text;
alter table public.affiliate_content_posts add column if not exists copy_length text;
alter table public.affiliate_content_posts add column if not exists permalink text;
alter table public.affiliate_content_runs add column if not exists provider text;
alter table public.affiliate_content_runs add column if not exists model text;
commit;
