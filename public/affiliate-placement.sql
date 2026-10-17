-- Nếp 2.10.0. Run after content/social-v2/automation/reels migrations.
-- Existing published posts are untouched and never receive retroactive comments.
begin;
alter table public.affiliate_content_posts
 add column if not exists affiliate_comment_text text,
 add column if not exists affiliate_comment_id text,
 add column if not exists affiliate_comment_status text not null default 'none',
 add column if not exists affiliate_comment_error text;
alter table public.affiliate_content_posts drop constraint if exists affiliate_comment_status_valid;
alter table public.affiliate_content_posts add constraint affiliate_comment_status_valid
 check (affiliate_comment_status in ('none','pending','sending','sent','failed','unknown'));
-- Preserve server-only writes and owner-only reads from content.sql.
commit;
