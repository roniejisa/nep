import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {publishReel} from '../lib/reel-publish.ts';
import {videoMetadata,reelSettings,slotFormats,postFormat} from '../lib/reel-rules.ts';

const body='Áo giặt xong vẫn lo mùi?\nLink affiliate · mình có thể nhận hoa hồng.\nhttps://s.shopee.vn/original';
const target={id:'123',token:'private-page-token',version:'v26.0'};
const videoUrl='https://storage.example.com/private/video.mp4?token=temporary';

test('Instagram Reel persists the owned video container, waits and publishes exactly once with unchanged caption/link',async()=>{
 const events=[];let reads=0;
 const result=await publishReel({channel:'instagram',body,videoUrl,target:{...target,instagramLogin:'instagram'},onContainer:async id=>events.push('persist:'+id),pause:async ms=>{assert.equal(ms,3000);},transport:async(url,options)=>{
  assert.ok(url.startsWith('https://graph.instagram.com/v26.0/'));assert.equal(options.headers.Authorization,'Bearer private-page-token');
  if(options.method==='GET'){reads++;return Response.json({status_code:reads===1?'IN_PROGRESS':'FINISHED'});}
  const values=Object.fromEntries(options.body);
  if(url.endsWith('/media')){assert.equal(values.media_type,'REELS');assert.equal(values.video_url,videoUrl);assert.equal(values.caption,body);assert.equal(values.share_to_feed,'true');events.push('create');return Response.json({id:'container1'});}
  assert.ok(events.includes('persist:container1'));assert.equal(reads,2);assert.equal(values.creation_id,'container1');events.push('publish');return Response.json({id:'reel1'});
 }});
 assert.equal(result.id,'reel1');assert.deepEqual(events,['create','persist:container1','publish']);
});

test('Facebook Reel uses fixed upload host and OAuth header, then confirms publishing status rather than upload readiness',async()=>{
 const events=[];let reads=0;
 const result=await publishReel({channel:'facebook',body,videoUrl,target,onContainer:async id=>events.push('persist:'+id),pause:async()=>{},transport:async(url,options)=>{
  assert.ok(!url.includes('private-page-token'));
  if(url.startsWith('https://rupload.facebook.com/')){
   assert.equal(url,'https://rupload.facebook.com/video-upload/v26.0/456');assert.equal(options.headers.Authorization,'OAuth private-page-token');assert.equal(options.headers.file_url,videoUrl);assert.ok(events.includes('persist:456'));events.push('upload');return Response.json({success:true});
  }
  assert.equal(options.headers.Authorization,'Bearer private-page-token');
  if(options.method==='GET'){reads++;assert.ok(events.includes('finish'));return Response.json({status:{video_status:'ready',publishing_phase:{status:reads===1?'in_progress':'complete'}}});}
  const values=Object.fromEntries(options.body);
  if(values.upload_phase==='start'){events.push('start');return Response.json({video_id:'456',upload_url:'https://attacker.example.com/do-not-use'});}
  assert.equal(values.video_id,'456');assert.equal(values.video_state,'PUBLISHED');assert.equal(values.description,body);events.push('finish');return Response.json({success:true});
 }});
 assert.equal(result.id,'456');assert.equal(reads,2);assert.deepEqual(events,['start','persist:456','upload','finish']);
});

test('Reel errors and uncertain finish never restart an upload or submit twice',async()=>{
 let calls=0;
 await assert.rejects(publishReel({channel:'facebook',body,videoUrl,target,onContainer:async()=>{},pause:async()=>{},transport:async(url,options)=>{
  calls++;
  if(url.includes('rupload'))return Response.json({success:true});
  if(options.method==='GET')return Response.json({status:{processing_phase:{status:'error'}}});
  return Response.json(options.body.get('upload_phase')==='start'?{video_id:'456'}:{success:true});
 }}));assert.equal(calls,4);
 calls=0;await assert.rejects(publishReel({channel:'instagram',body,videoUrl,target,onContainer:async()=>{},pause:async()=>{},transport:async(_url,options)=>{calls++;return Response.json(options.method==='POST'?{id:'container'}:{status_code:'ERROR'});}}));assert.equal(calls,2);
 calls=0;await assert.rejects(publishReel({channel:'facebook',body,videoUrl,target,onContainer:async()=>{},deadline:Date.now()-1,transport:async()=>{calls++;return Response.json({});}}));assert.equal(calls,0);
 calls=0;await assert.rejects(publishReel({channel:'facebook',body,videoUrl,target,onContainer:async()=>{throw new Error('Database unavailable');},transport:async()=>{calls++;return Response.json({video_id:'456'});}}));assert.equal(calls,1);
});

test('Reel validation accepts a compatibility profile and per-slot formats override a mixed/default schedule',()=>{
 const valid={size_bytes:1000000,duration:20,width:1080,height:1920};assert.doesNotThrow(()=>videoMetadata(valid));
 for(const change of [{size_bytes:52428801},{duration:3},{duration:61},{width:1920,height:1080},{width:270,height:480}])assert.throws(()=>videoMetadata({...valid,...change}));
 assert.equal(postFormat(undefined),'feed');assert.throws(()=>postFormat('story'));
 const cfg=reelSettings({format_mode:'mixed',schedule_times:['08:00','10:00'],slot_formats:{'08:00':'reel','10:00':'feed'}});
 assert.deepEqual(slotFormats(cfg,new Date('2026-10-16T08:00:00+07:00')),['reel']);assert.deepEqual(slotFormats(cfg,new Date('2026-10-16T10:00:00+07:00')),['feed']);assert.deepEqual(slotFormats(cfg,new Date('2026-10-16T12:00:00+07:00')),['feed','reel']);
 assert.throws(()=>reelSettings({schedule_times:['08:00'],slot_formats:{'09:00':'reel'}}));assert.throws(()=>reelSettings({slot_formats:[]}));
});

test('Reel migration preserves old posts, private WebP storage, and isolates video files/metadata by owner',async()=>{
 const db=new PGlite(),a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',pa='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',pb='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',v='33333333-3333-4333-8333-333333333333';
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key);insert into auth.users values('${a}'),('${b}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
   create function storage.extension(name text) returns text language sql immutable as $$select reverse(split_part(reverse(name),'.',1))$$;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
   grant usage on schema auth,storage,public to authenticated,anon,service_role;grant select,insert,update,delete on storage.objects to authenticated;`);
  for(const file of ['schema.sql','content.sql','social-v2.sql','automation.sql','automation-controls.sql','automation-flex.sql','automation-times.sql','automation-unrestricted.sql'])await db.exec(await readFile(new URL('../supabase/'+file,import.meta.url),'utf8'));
  await db.exec(`insert into affiliate_products(id,owner_id,name,affiliate_url) values('${pa}','${a}','A','https://example.com/a'),('${pb}','${b}','B','https://example.com/b');insert into affiliate_content_posts(owner_id,product_id,channel,body,status) values('${a}','${pa}','facebook','old','published');insert into affiliate_automation_settings(owner_id) values('${a}');`);
  const migration=await readFile(new URL('../supabase/reels.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
  assert.equal((await db.query('select post_format from affiliate_content_posts')).rows[0].post_format,'feed');assert.equal((await db.query('select format_mode from affiliate_automation_settings')).rows[0].format_mode,'feed');
  const buckets=(await db.query('select * from storage.buckets order by id')).rows;assert.ok(buckets.every(row=>row.public===false));assert.deepEqual(buckets.find(row=>row.id==='affiliate-product-images').allowed_mime_types,['image/webp']);
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${a}',false);`);
  const insert=owner=>db.query(`insert into affiliate_product_videos(id,owner_id,product_id,storage_path,original_name,size_bytes,duration,width,height,approved) values($1,$2,$3,$4,'video.mp4',1024,20,1080,1920,true)`,[v,owner,pa,`${owner}/${pa}/${v}.mp4`]);
  await assert.rejects(insert(b));await insert(a);
  await db.query("insert into storage.objects(bucket_id,name) values('affiliate-product-videos',$1)",[`${a}/${pa}/${v}.mp4`]);
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('affiliate-product-videos',$1)",[`${a}/${pb}/${v}.mp4`]));
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('affiliate-product-videos',$1)",[`${a}/${pa}/bad.webp`]));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);assert.equal((await db.query('select * from affiliate_product_videos')).rows.length,0);assert.equal((await db.query("select * from storage.objects where bucket_id='affiliate-product-videos'")).rows.length,0);
  assert.equal((await db.query('delete from affiliate_product_videos returning id')).rows.length,0);
  await db.exec('set role anon');await assert.rejects(db.query('select * from affiliate_product_videos'));await assert.rejects(db.query('delete from affiliate_product_videos'));
  await db.exec('reset role');await assert.rejects(db.query(`insert into affiliate_content_posts(owner_id,product_id,channel,body,post_format,video_id) values('${a}','${pa}','threads','invalid','reel','${v}')`));
  assert.equal((await db.query('select count(*)::int n from affiliate_content_posts')).rows[0].n,1);
 }finally{await db.close();}
});
