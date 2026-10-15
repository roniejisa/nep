-- Fix the upload policy without deleting products, images, or the bucket.
-- Qualify storage.objects.name so the product subquery cannot resolve it to p.name.
begin;
alter policy "affiliate_storage_insert" on storage.objects
with check (
  bucket_id = 'affiliate-product-images'
  and (storage.foldername(storage.objects.name))[1] = (select auth.uid())::text
  and lower(storage.extension(storage.objects.name)) = 'webp'
  and exists (
    select 1 from public.affiliate_products p
    where p.id::text = (storage.foldername(storage.objects.name))[2]
      and p.owner_id = (select auth.uid())
  )
);
commit;
