-- Nếp 2.11.0. Run after existing schema + automation-flex.sql.
begin;
alter table public.affiliate_products
 add column if not exists source_platform text,
 add column if not exists external_product_id text,
 add column if not exists external_shop_id text,
 add column if not exists import_metadata jsonb not null default '{}';
-- Backfill only an unambiguous representative. Never delete/merge older products or histories.
with candidates as (
 select id,owner_id,regexp_match(source_url,'^https://(?:www\.|m\.)?shopee\.vn/(?:product/([0-9]+)/([0-9]+)|.*-i\.([0-9]+)\.([0-9]+))(?:[/?#]|$)') m,
 created_at from public.affiliate_products where external_product_id is null
), ranked as (
 select *,row_number() over(partition by owner_id,coalesce(m[2],m[4]) order by created_at,id) rn from candidates where m is not null
)
update public.affiliate_products p set source_platform='shopee',external_product_id=coalesce(r.m[2],r.m[4]),external_shop_id=coalesce(r.m[1],r.m[3])
from ranked r where p.id=r.id and r.rn=1 and not exists(select 1 from public.affiliate_products x where x.owner_id=r.owner_id and x.source_platform='shopee' and x.external_product_id=coalesce(r.m[2],r.m[4]));
create unique index if not exists affiliate_products_external_identity on public.affiliate_products(owner_id,source_platform,external_product_id) where external_product_id is not null;
create or replace function public.affiliate_product_identity() returns trigger language plpgsql set search_path='' as $$
declare m text[];
begin
 m:=regexp_match(new.source_url,'^https://(?:www\.|m\.)?shopee\.vn/(?:product/([0-9]+)/([0-9]+)|.*-i\.([0-9]+)\.([0-9]+))(?:[/?#]|$)');
 if m is not null then
  if new.external_product_id is not null and new.external_product_id<>coalesce(m[2],m[4]) then raise exception 'Product ID differs from source URL';end if;
  new.source_platform:='shopee';new.external_product_id:=coalesce(m[2],m[4]);new.external_shop_id:=coalesce(m[1],m[3]);
 end if;
 if new.external_product_id is not null and (new.source_platform is distinct from 'shopee' or new.external_product_id!~'^[0-9]{1,20}$' or coalesce(new.external_shop_id,'')!~'^[0-9]{1,20}$') then raise exception 'Invalid product identity';end if;
 return new;
end;$$;
drop trigger if exists affiliate_product_identity on public.affiliate_products;
create trigger affiliate_product_identity before insert or update of source_url,source_platform,external_product_id,external_shop_id on public.affiliate_products for each row execute function public.affiliate_product_identity();

alter table public.affiliate_product_images add column if not exists source_fingerprint text;
create unique index if not exists affiliate_images_fingerprint on public.affiliate_product_images(owner_id,product_id,source_fingerprint) where source_fingerprint is not null;
create or replace function public.affiliate_limit_product_images() returns trigger language plpgsql set search_path='' as $$
begin
 perform 1 from public.affiliate_products where id=new.product_id and owner_id=new.owner_id for update;
 if (select count(*) from public.affiliate_product_images where product_id=new.product_id and owner_id=new.owner_id)>=12 then raise exception 'Product has 12 images';end if;
 return new;
end;$$;
drop trigger if exists affiliate_limit_product_images on public.affiliate_product_images;
create trigger affiliate_limit_product_images before insert on public.affiliate_product_images for each row execute function public.affiliate_limit_product_images();

create table if not exists public.affiliate_product_image_jobs (
 product_id uuid primary key,owner_id uuid not null,source_url text not null,
 image_urls text[] not null default '{}',max_images integer not null default 1 check(max_images between 1 and 6),
 status text not null default 'pending' check(status in('pending','running','done','failed')),
 attempts integer not null default 0,claimed_at timestamptz,error text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(product_id,owner_id) references public.affiliate_products(id,owner_id) on delete cascade
);
create index if not exists affiliate_image_jobs_owner_status on public.affiliate_product_image_jobs(owner_id,status,created_at);
alter table public.affiliate_product_image_jobs enable row level security;
revoke all on public.affiliate_product_image_jobs from anon,authenticated;
grant select on public.affiliate_product_image_jobs to authenticated;
grant all on public.affiliate_product_image_jobs to service_role;
drop policy if exists affiliate_image_jobs_read_own on public.affiliate_product_image_jobs;
create policy affiliate_image_jobs_read_own on public.affiliate_product_image_jobs for select to authenticated using(owner_id=(select auth.uid()));

create or replace function public.import_affiliate_product(p_owner uuid,p_item jsonb,p_category text,p_images integer default 1,p_fetch boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.affiliate_products;urls text[];matches integer;
begin
 if length(btrim(p_category)) not between 1 and 80 or p_images not between 1 and 6 then raise exception 'Invalid import options';end if;
 perform pg_advisory_xact_lock(hashtextextended('product-import:'||p_owner::text,0));
 select count(*) into matches from public.affiliate_products where owner_id=p_owner and (
  (source_platform='shopee' and external_product_id=p_item->>'external_product_id') or source_url=p_item->>'source_url' or affiliate_url=p_item->>'affiliate_url');
 if matches>1 then return jsonb_build_object('state','conflict','message','Kho có nhiều bản ghi khớp mã/link. Kiểm tra thủ công; không tạo thêm.');end if;
 select * into p from public.affiliate_products where owner_id=p_owner and (
  (source_platform='shopee' and external_product_id=p_item->>'external_product_id') or source_url=p_item->>'source_url' or affiliate_url=p_item->>'affiliate_url') limit 1 for update;
 if found then
  if (p.external_product_id is not null and p.external_product_id<>p_item->>'external_product_id') or (p.external_shop_id is not null and p.external_shop_id<>p_item->>'external_shop_id') then return jsonb_build_object('state','conflict','message','Mã/shop không khớp sản phẩm đang có.');end if;
  if p.external_product_id is null then
   update public.affiliate_products set source_platform='shopee',external_product_id=p_item->>'external_product_id',external_shop_id=p_item->>'external_shop_id',source_url=case when source_url='' then p_item->>'source_url' else source_url end where id=p.id;
  end if;
  if p_fetch and not exists(select 1 from public.affiliate_product_images where product_id=p.id and owner_id=p_owner) then
   select coalesce(array_agg(value),'{}') into urls from jsonb_array_elements_text(coalesce(p_item->'image_urls','[]'));
   insert into public.affiliate_product_image_jobs(product_id,owner_id,source_url,image_urls,max_images) values(p.id,p_owner,p_item->>'source_url',urls,p_images)
   on conflict(product_id) do update set image_urls=excluded.image_urls,max_images=excluded.max_images,status='pending',attempts=0,error=null,claimed_at=null,updated_at=now()
   where affiliate_product_image_jobs.status<>'running' and cardinality(excluded.image_urls)>0 and affiliate_product_image_jobs.image_urls is distinct from excluded.image_urls;
  end if;
  -- Refresh the CSV snapshot only; editable descriptions/links/status remain intact.
  update public.affiliate_products set import_metadata=coalesce(import_metadata,'{}'::jsonb)||coalesce(p_item->'metadata','{}'::jsonb) where id=p.id and owner_id=p_owner;
  return jsonb_build_object('state','existing','id',p.id,'message','Đã có trong kho; giữ thông tin đã chỉnh và cập nhật bản CSV gốc.');
 end if;
 if (select count(*) from public.affiliate_products where owner_id=p_owner)>=1000 then return jsonb_build_object('state','capacity','message','Kho đã đủ 1.000 sản phẩm của phiên bản hiện tại.');end if;
 insert into public.affiliate_categories(owner_id,name) values(p_owner,btrim(p_category)) on conflict do nothing;
 insert into public.affiliate_products(owner_id,name,category,description,affiliate_url,source_url,shop_name,price,commission_rate,status,verified_at,source_platform,external_product_id,external_shop_id,import_metadata)
 values(p_owner,p_item->>'name',btrim(p_category),coalesce(p_item->>'description',''),p_item->>'affiliate_url',p_item->>'source_url',coalesce(p_item->>'shop_name',''),(p_item->>'price')::numeric,(p_item->>'commission_rate')::numeric,'draft',null,'shopee',p_item->>'external_product_id',p_item->>'external_shop_id',coalesce(p_item->'metadata','{}')) returning * into p;
 if p_fetch then
  select coalesce(array_agg(value),'{}') into urls from jsonb_array_elements_text(coalesce(p_item->'image_urls','[]'));
  insert into public.affiliate_product_image_jobs(product_id,owner_id,source_url,image_urls,max_images) values(p.id,p_owner,p.source_url,urls,p_images);
 end if;
 return jsonb_build_object('state','inserted','id',p.id,'message',case when p_fetch then 'Đã nhập Nháp; ảnh được xếp hàng.' else 'Đã nhập Nháp.' end);
end;$$;
create or replace function public.claim_affiliate_product_image(p_owner uuid)
returns setof public.affiliate_product_image_jobs language plpgsql security definer set search_path=public,pg_temp as $$
declare job public.affiliate_product_image_jobs;
begin
 perform pg_advisory_xact_lock(hashtextextended('image-worker:'||p_owner::text,0));
 update public.affiliate_product_image_jobs set status='failed',error='Lượt lấy ảnh bị ngắt hai lần. Kiểm tra rồi thử lại thủ công.',updated_at=now() where owner_id=p_owner and status='running' and claimed_at<now()-interval '3 minutes' and attempts>=2;
 if exists(select 1 from public.affiliate_product_image_jobs where owner_id=p_owner and status='running' and claimed_at>=now()-interval '3 minutes') then return;end if;
 select * into job from public.affiliate_product_image_jobs where owner_id=p_owner and (status='pending' or status='running' and claimed_at<now()-interval '3 minutes' and attempts<2) order by created_at,product_id limit 1 for update skip locked;
 if not found then return;end if;
 return query update public.affiliate_product_image_jobs set status='running',attempts=attempts+1,claimed_at=now(),error=null,updated_at=now() where product_id=job.product_id returning *;
end;$$;
revoke all on function public.import_affiliate_product(uuid,jsonb,text,integer,boolean),public.claim_affiliate_product_image(uuid) from public,anon,authenticated;
grant execute on function public.import_affiliate_product(uuid,jsonb,text,integer,boolean),public.claim_affiliate_product_image(uuid) to service_role;
commit;
