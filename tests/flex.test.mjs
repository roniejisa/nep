import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {postImages} from '../lib/post-images.ts';
import {publishSocial} from '../lib/social-publish.ts';
const target={id:'123',token:'secret',version:'v26.0'};
for(const channel of ['threads','instagram'])test(`${channel} carousel waits on children and parent, persists containers and publishes once`,async()=>{
 const created=[],persisted=[];let final=0;
 const result=await publishSocial({channel,body:'copy',imageUrls:['https://example.com/a.jpg','https://example.com/b.jpg'],target,onContainer:async id=>persisted.push(id),pause:async()=>{},transport:async(url,options)=>{
 if(options.method==='GET'){assert.ok(persisted.some(id=>url.includes('/'+id+'?')));return Response.json({[channel==='instagram'?'status_code':'status']:'FINISHED'});}
 const values=Object.fromEntries(options.body);
 if(url.includes('_publish')){final++;assert.equal(values.creation_id,'c3');assert.deepEqual(persisted,['c1','c2','c3']);return Response.json({id:'post'});}
 created.push(values);if(created.length<=2){assert.equal(values.is_carousel_item,'true');assert.ok(!values.caption&&!values.text);}else{assert.equal(values.media_type,'CAROUSEL');assert.equal(values.children,'c1,c2');assert.equal(values[channel==='instagram'?'caption':'text'],'copy');}
 return Response.json({id:'c'+created.length});
 }});
 assert.equal(result.id,'post');assert.equal(final,1);
});
test('Facebook multi-photo upload creates unpublished children then one attached feed post',async()=>{
 const requests=[];const result=await publishSocial({channel:'facebook',body:'copy',imageUrls:['https://example.com/a','https://example.com/b'],target,onContainer:async()=>{},transport:async(url,options)=>{const values=Object.fromEntries(options.body);requests.push(values);if(url.endsWith('/photos')){assert.equal(values.published,'false');return Response.json({id:'photo'+requests.length});}assert.ok(url.endsWith('/feed'));assert.deepEqual(JSON.parse(values.attached_media),[{media_fbid:'photo1'},{media_fbid:'photo2'}]);return Response.json({id:'fbpost'});}});assert.equal(result.id,'fbpost');assert.equal(requests.length,3);
});
test('failed carousel child or elapsed deadline never publishes a parent',async()=>{
 let calls=0;await assert.rejects(publishSocial({channel:'instagram',body:'copy',imageUrls:['a','b'],target,onContainer:async()=>{},transport:async(url,options)=>{calls++;assert.ok(!url.includes('media_publish'));return Response.json(options.method==='POST'?{id:'child'}:{status_code:'ERROR'});}}));assert.equal(calls,2);
 calls=0;await assert.rejects(publishSocial({channel:'facebook',body:'copy',target,onContainer:async()=>{},deadline:Date.now()-1,transport:async()=>{calls++;return Response.json({id:'x'});}}));assert.equal(calls,0);
});
test('flex migration preserves limits, supports minute windows, renames categories and safely deletes drafts',async()=>{
 const db=new PGlite(),owner='11111111-1111-4111-8111-111111111111',other='33333333-3333-4333-8333-333333333333',product='22222222-2222-4222-8222-222222222222';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');create function auth.uid() returns uuid language sql as $$select null::uuid$$;create table affiliate_products(id uuid primary key,owner_id uuid,category text default 'Khác',status text default 'ready');insert into affiliate_products values('${product}','${owner}','Chăm sóc tóc','ready');create table affiliate_product_images(id uuid primary key);`);
 for(const name of ['content.sql','social-v2.sql','automation.sql','automation-controls.sql','automation-flex.sql'])await db.exec(await readFile(new URL('../supabase/'+name,import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/automation-flex.sql',import.meta.url),'utf8'));
 await db.exec(`insert into affiliate_automation_settings(owner_id,enabled,selection_mode,selected_categories,morning_start) values('${owner}',true,'categories','["Chăm sóc tóc"]',7.5)`);
 assert.equal((await db.query(`select affiliate_posting_period('2026-10-16T07:29:00+07',7.5::numeric,12::numeric,18::numeric,23::numeric) p`)).rows[0].p,null);
 assert.equal((await db.query(`select affiliate_posting_period('2026-10-16T07:30:00+07',7.5::numeric,12::numeric,18::numeric,23::numeric) p`)).rows[0].p,'morning');
 await db.exec(`select manage_affiliate_category('${owner}','rename','Chăm sóc tóc','Tóc');`);
 assert.equal((await db.query(`select category from affiliate_products`)).rows[0].category,'Tóc');
 assert.deepEqual((await db.query(`select selected_categories from affiliate_automation_settings`)).rows[0].selected_categories,['Tóc']);
 await db.exec(`select manage_affiliate_category('${owner}','delete','Tóc');`);
 const cfg=(await db.query('select * from affiliate_automation_settings')).rows[0];assert.equal(cfg.enabled,false);assert.deepEqual(cfg.selected_categories,[]);assert.equal((await db.query('select category from affiliate_products')).rows[0].category,'Khác');
 const insert=async(status,user=owner)=>(await db.query(`insert into affiliate_content_posts(owner_id,product_id,channel,body,status) values($1,'${product}','facebook','copy',$2) returning id`,[user,status])).rows[0].id;
 const draft=await insert('draft');await db.exec(`update affiliate_automation_settings set morning_start=0,morning_end=12,evening_start=12,evening_end=24`);assert.equal((await db.query(`select reserve_affiliate_product_post('${owner}','${draft}') ok`)).rows[0].ok,true);const published=await insert('published'),unknown=await insert('unknown'),foreign=await insert('draft',other);
 const remove=ids=>db.query(`select delete_affiliate_content('${owner}',$1) n`,[ids]);
 assert.equal((await remove([draft,foreign])).rows[0].n,1);assert.equal((await db.query(`select id from affiliate_content_posts where id=$1`,[draft])).rows.length,0);assert.equal((await db.query(`select id from affiliate_content_posts where id=$1`,[foreign])).rows.length,1);
 assert.equal((await db.query('select count(*)::int n from affiliate_product_post_slots')).rows[0].n,1);await remove([published]);assert.ok((await db.query(`select deleted_at from affiliate_content_posts where id=$1`,[published])).rows[0].deleted_at);
 await assert.rejects(remove([unknown]));
 await db.exec(`create schema net;create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$select 1::bigint$$;`);const schedule=await readFile(new URL('../supabase/automation-schedule.sql',import.meta.url),'utf8');await db.query(schedule.split('$job$')[1]);
 await db.exec('set role authenticated');await assert.rejects(remove([foreign]));await assert.rejects(db.query('select * from affiliate_categories'));
 }finally{await db.close();}
});

test('media identifiers cannot be duplicated or exceed the supported image count',()=>{
 const id='11111111-1111-4111-8111-111111111111';assert.deepEqual(postImages(undefined,id),[id]);assert.deepEqual(postImages([]),[]);assert.throws(()=>postImages([id,id]));assert.throws(()=>postImages(['not-an-image-id']));assert.throws(()=>postImages(Array(11).fill(id)));
});
