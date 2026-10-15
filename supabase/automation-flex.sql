-- Upgrade after automation-controls.sql.
begin;
alter table public.affiliate_products drop constraint if exists affiliate_products_category_check;
alter table public.affiliate_products add constraint affiliate_products_category_check check(length(btrim(category)) between 1 and 80) not valid;
alter table public.affiliate_automation_settings alter column morning_start type numeric(7,4),alter column morning_end type numeric(7,4),alter column evening_start type numeric(7,4),alter column evening_end type numeric(7,4);
create or replace function public.affiliate_posting_period(p_at timestamptz,p_ms numeric,p_me numeric,p_es numeric,p_ee numeric)
returns text language sql immutable as $$
 select case when extract(hour from p_at at time zone 'Asia/Ho_Chi_Minh')*60+extract(minute from p_at at time zone 'Asia/Ho_Chi_Minh')>=round(p_ms*60) and extract(hour from p_at at time zone 'Asia/Ho_Chi_Minh')*60+extract(minute from p_at at time zone 'Asia/Ho_Chi_Minh')<round(p_me*60) then 'morning'
 when extract(hour from p_at at time zone 'Asia/Ho_Chi_Minh')*60+extract(minute from p_at at time zone 'Asia/Ho_Chi_Minh')>=round(p_es*60) and extract(hour from p_at at time zone 'Asia/Ho_Chi_Minh')*60+extract(minute from p_at at time zone 'Asia/Ho_Chi_Minh')<round(p_ee*60) then 'evening' else null end;
$$;
create table if not exists public.affiliate_categories(owner_id uuid not null references auth.users(id) on delete cascade,name text not null check(length(btrim(name)) between 1 and 80),primary key(owner_id,name));
insert into public.affiliate_categories(owner_id,name) select distinct owner_id,category from public.affiliate_products on conflict do nothing;
alter table public.affiliate_categories enable row level security;
revoke all on public.affiliate_categories from anon,authenticated;
grant all on public.affiliate_categories to service_role;
alter table public.affiliate_automation_settings add column if not exists selection_mode text not null default 'random' check(selection_mode in ('random','products','categories'));
alter table public.affiliate_automation_settings add column if not exists selected_products jsonb not null default '[]';
alter table public.affiliate_automation_settings add column if not exists selected_categories jsonb not null default '[]';
alter table public.affiliate_automation_settings add column if not exists max_images integer not null default 1 check(max_images between 0 and 10);
alter table public.affiliate_content_posts add column if not exists image_ids uuid[] not null default '{}';
alter table public.affiliate_content_posts add column if not exists deleted_at timestamptz;
update public.affiliate_content_posts set image_ids=array[image_id] where image_id is not null and cardinality(image_ids)=0;
alter table public.affiliate_content_posts drop constraint if exists post_images_count;
alter table public.affiliate_content_posts add constraint post_images_count check(cardinality(image_ids)<=10);

create or replace function public.manage_affiliate_category(p_owner uuid,p_action text,p_name text,p_new text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare target text:=btrim(coalesce(p_new,''));source text:=btrim(p_name);
begin
 if length(source) not between 1 and 80 then raise exception 'Invalid category name';end if;
 perform pg_advisory_xact_lock(hashtextextended('categories:'||p_owner::text,0));
 if p_action='create' then insert into public.affiliate_categories values(p_owner,source) on conflict do nothing;return;end if;
 if source='Khác' then raise exception 'Cannot rename or remove fallback category';end if;
 if p_action='delete' then target:='Khác';elsif p_action<>'rename' or length(target) not between 1 and 80 then raise exception 'Invalid category action';end if;
 insert into public.affiliate_categories values(p_owner,target) on conflict do nothing;
 update public.affiliate_products set category=target where owner_id=p_owner and category=source;
 delete from public.affiliate_categories where owner_id=p_owner and name=source and name<>target;
 update public.affiliate_automation_settings set selected_categories=coalesce((select jsonb_agg(distinct case when value=source then target else value end) from jsonb_array_elements_text(selected_categories) where p_action<>'delete' or value<>source), '[]'::jsonb),enabled=case when p_action='delete' and selection_mode='categories' and selected_categories ? source then false else enabled end,updated_at=now() where owner_id=p_owner;
end;$$;
create or replace function public.delete_affiliate_content(p_owner uuid,p_posts uuid[])
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.affiliate_content_posts;n integer:=0;
begin
 if cardinality(p_posts) not between 1 and 100 then raise exception 'Select 1 to 100 posts';end if;
 for r in select * from public.affiliate_content_posts where owner_id=p_owner and id=any(p_posts) order by id for update loop
  if r.status in ('publishing','unknown') then raise exception 'Verify uncertain Meta results before removing these records';end if;
  if r.status='draft' then delete from public.affiliate_content_posts where id=r.id;else update public.affiliate_content_posts set deleted_at=now() where id=r.id;end if;
  n:=n+1;
 end loop;
 return n;
end;$$;
revoke all on function public.manage_affiliate_category(uuid,text,text,text),public.delete_affiliate_content(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.manage_affiliate_category(uuid,text,text,text),public.delete_affiliate_content(uuid,uuid[]) to service_role;
commit;
