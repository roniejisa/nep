import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('upload policy reproduces the name-shadowing bug and fixes it while isolating owners', async () => {
  const db = new PGlite();
  const userA = '11111111-1111-4111-8111-111111111111';
  const userB = '22222222-2222-4222-8222-222222222222';
  const productA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const productB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  try {
    // Reproduce the Supabase auth/storage contracts needed by the real migration.
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
      create function storage.extension(name text) returns text language sql immutable as $$select reverse(split_part(reverse(name),'.',1))$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant usage on schema auth,storage,public to authenticated,anon;
      grant select,insert,update,delete on storage.objects to authenticated;
      insert into auth.users values('${userA}'),('${userB}');
    `);
    await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url),'utf8'));
    await db.exec(`insert into public.affiliate_products(id,owner_id,name,affiliate_url) values
      ('${productA}','${userA}','Sữa tắm Lifebuoy 800g','https://s.shopee.vn/product-a'),
      ('${productB}','${userB}','Sản phẩm tài khoản khác','https://s.shopee.vn/product-b');
      alter policy "affiliate_storage_insert" on storage.objects with check (
        bucket_id='affiliate-product-images'
        and (storage.foldername(name))[1]=(select auth.uid())::text
        and lower(storage.extension(name))='webp'
        and exists(select 1 from public.affiliate_products p where p.id::text=(storage.foldername(name))[2] and p.owner_id=(select auth.uid()))
      );
      set role authenticated;
      select set_config('request.jwt.claim.sub','${userA}',false);
    `);
    const upload = path => db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', ['affiliate-product-images',path]);
    // Original policy rejects even a correctly owned, valid WebP path.
    await assert.rejects(upload(`${userA}/${productA}/original.webp`), e => e.code === '42501');
    await db.exec('reset role');
    await db.exec(await readFile(new URL('../supabase/fix-storage-policy.sql',import.meta.url),'utf8'));
    await db.exec('set role authenticated');
    await upload(`${userA}/${productA}/fixed.webp`);
    await assert.rejects(upload(`${userB}/${productB}/wrong-owner.webp`), e => e.code === '42501');
    await assert.rejects(upload(`${userA}/${productB}/wrong-product.webp`), e => e.code === '42501');
    await assert.rejects(upload(`${userA}/${productA}/wrong-format.jpg`), e => e.code === '42501');
    const { rows } = await db.query('select name from storage.objects');
    assert.deepEqual(rows.map(r=>r.name),[`${userA}/${productA}/fixed.webp`]);
  } finally { await db.close(); }
});
