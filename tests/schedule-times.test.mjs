import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {paginate,pageWindow,requestPage} from '../lib/pagination.ts';
test('pagination preserves every item and clamps empty or shrinking final pages',()=>{
 const items=Array.from({length:37},(_,i)=>i),pages=[1,2,3,4].flatMap(p=>paginate(items,p,12).items);assert.deepEqual(pages,items);
 assert.deepEqual(paginate([],99,12).items,[]);assert.equal(pageWindow(13,99,12).page,2);assert.deepEqual(paginate(items,4,12).items,[36]);
 assert.equal(requestPage('NaN'),1);assert.equal(requestPage('-1'),1);assert.equal(requestPage('2'),2);assert.equal(requestPage('999999'),10000);
});
test('SQL schedules accept arbitrary slots and enforce exact-once claims plus product caps outside old windows',async()=>{
 const db=new PGlite(),owner='11111111-1111-4111-8111-111111111111',product='22222222-2222-4222-8222-222222222222';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${owner}');create function auth.uid() returns uuid language sql as $$select null::uuid$$;create table affiliate_products(id uuid primary key,owner_id uuid,category text default 'Khác',status text default 'ready');insert into affiliate_products(id,owner_id) values('${product}','${owner}');create table affiliate_product_images(id uuid primary key);`);
 for(const file of ['content.sql','social-v2.sql','automation.sql','automation-controls.sql','automation-flex.sql','automation-times.sql'])await db.exec(await readFile(new URL('../supabase/'+file,import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/automation-times.sql',import.meta.url),'utf8'));
 await db.exec(`insert into affiliate_automation_settings(owner_id,enabled,schedule_mode,schedule_times,daily_limit) values('${owner}',true,'times','["07:00","09:00","14:00","23:59"]',10)`);
 const due=async time=>(await db.query(`select due_affiliate_slot('${owner}',$1::timestamptz) slot`,[time])).rows[0].slot;
 assert.equal(await due('2026-10-16T06:59:00+07'),null);assert.ok(await due('2026-10-16T07:04:59+07'));assert.equal(await due('2026-10-16T07:05:00+07'),null);assert.ok(await due('2026-10-16T14:00:00+07'));
 await assert.rejects(db.query(`update affiliate_automation_settings set schedule_times='["07:00","07:00"]'`));
 await assert.rejects(db.query(`update affiliate_automation_settings set schedule_times='["07:00","07:10"]'`));
 // Make one slot due now without depending on the runner's timezone.
 await db.exec(`update affiliate_automation_settings set schedule_times=jsonb_build_array(to_char(now() at time zone 'Asia/Ho_Chi_Minh','HH24:MI'))`);
 const claim=async()=>(await db.query(`select claim_affiliate_automation('${owner}') id`)).rows[0].id;
 assert.ok(await claim());assert.equal(await claim(),null);
 await db.exec(`update affiliate_automation_jobs set status='done'`);assert.equal(await claim(),null);
 const first=(await db.query(`insert into affiliate_content_posts(owner_id,product_id,channel,body) values('${owner}','${product}','facebook','copy') returning id`)).rows[0].id;
 assert.equal((await db.query(`select reserve_affiliate_product_post('${owner}','${first}') ok`)).rows[0].ok,true);
 const second=(await db.query(`insert into affiliate_content_posts(owner_id,product_id,channel,body) values('${owner}','${product}','threads','copy') returning id`)).rows[0].id;
 assert.equal((await db.query(`select reserve_affiliate_product_post('${owner}','${second}') ok`)).rows[0].ok,false);
 await db.exec(`create schema net;create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$select 1::bigint$$;`);
 const schedule=await readFile(new URL('../supabase/automation-schedule.sql',import.meta.url),'utf8');assert.equal((await db.query(schedule.split('$job$')[1])).rows.length,0); // already claimed, no duplicate HTTP call
 await db.exec('set role authenticated');await assert.rejects(due('2026-10-16T07:00:00+07'));await assert.rejects(claim());
 }finally{await db.close();}
});
