import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import sharp from 'sharp';
import {signImage,verifyImage} from '../lib/social-image-token.ts';
import {socialJpeg} from '../lib/social-jpeg.ts';
import {publishSocial} from '../lib/social-publish.ts';
import {contentBrief,validateGeneratedCopy,selectedChannels,hasDisclosure} from '../lib/content-rules.ts';
test('signed media links expire and cannot select another image by changing payload',()=>{
 const id='11111111-1111-4111-8111-111111111111';const token=signImage(id,'secret',1000000);assert.equal(verifyImage(token,'secret',1000000),id);
 assert.throws(()=>verifyImage(token,'wrong',1000000));assert.throws(()=>verifyImage(token,'secret',4600001));assert.throws(()=>verifyImage(token+'x','secret',1000000));
 const [payload,mac]=token.split('.');const modified=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(payload,'base64url')),imageId:'22222222-2222-4222-8222-222222222222'})).toString('base64url');assert.throws(()=>verifyImage(modified+'.'+mac,'secret',1000000));
});
test('WebP storage image can be delivered as a JPEG square without saving another object',async()=>{
 const webp=await sharp({create:{width:400,height:700,channels:3,background:'#aabbcc'}}).webp().toBuffer();const jpeg=await socialJpeg(webp);const metadata=await sharp(jpeg).metadata();assert.equal(metadata.format,'jpeg');assert.equal(metadata.width,1080);assert.equal(metadata.height,1080);await assert.rejects(socialJpeg(Buffer.from('not webp')));
});
for(const channel of ['threads','instagram'])test(`${channel} waits for media readiness and saves container before publishing`,async()=>{
 const events=[];let statusReads=0;
 const result=await publishSocial({channel,body:'copy',imageUrl:'https://example.com/image.jpg',target:{id:'123',token:'secret',version:'v25.0'},onContainer:async id=>events.push('persist:'+id),pause:async()=>{},transport:async(url,options)=>{
  assert.equal(options.headers.Authorization,'Bearer secret');assert.ok(!url.includes('secret'));
  if(options.method==='POST'){
   const values=Object.fromEntries(options.body);
   if(url.includes('_publish')){assert.ok(events.includes('persist:container1'));assert.ok(statusReads===2);events.push('publish');assert.equal(values.creation_id,'container1');return Response.json({id:'post1'});}
   assert.equal(values[channel==='instagram'?'caption':'text'],'copy');assert.equal(values.image_url,'https://example.com/image.jpg');return Response.json({id:'container1'});
  }
  statusReads++;return Response.json({[channel==='instagram'?'status_code':'status']:statusReads===1?'IN_PROGRESS':'FINISHED'});
 }});assert.equal(result.id,'post1');assert.deepEqual(events,['persist:container1','publish']);
});
test('Instagram without media and errored containers never call publish',async()=>{
 let calls=0;await assert.rejects(publishSocial({channel:'instagram',body:'test',target:{id:'1',token:'key',version:'v25.0'},onContainer:async()=>{},transport:async()=>{calls++;return Response.json({});}}));assert.equal(calls,0);
 await assert.rejects(publishSocial({channel:'instagram',body:'test',imageUrl:'https://example.com/image.jpg',target:{id:'1',token:'key',version:'v25.0'},onContainer:async()=>{},transport:async(url,options)=>{calls++;assert.ok(!url.includes('media_publish'));return Response.json(options.method==='POST'?{id:'c'}:{status_code:'ERROR'});}}));assert.equal(calls,2);
});
test('existing Facebook text publishing remains a single feed request',async()=>{
 let calls=0;const result=await publishSocial({channel:'facebook',body:'working copy',target:{id:'123',token:'key',version:'v25.0'},onContainer:async()=>assert.fail(),transport:async(url,options)=>{calls++;assert.ok(url.endsWith('/123/feed'));assert.equal(options.body.get('message'),'working copy');return Response.json({id:'fb1'});}});assert.equal(calls,1);assert.equal(result.id,'fb1');
});
test('short content is bounded and legacy affiliate disclosures remain valid',()=>{
 assert.equal(contentBrief('short','curiosity').limits.threads,180);assert.throws(()=>contentBrief('long','problem'));assert.throws(()=>selectedChannels(['instagram','instagram']));assert.deepEqual(selectedChannels(['instagram']),['instagram']);assert.throws(()=>validateGeneratedCopy('a'.repeat(181),180));assert.throws(()=>validateGeneratedCopy('a'.repeat(71)+'\nshort',180));assert.doesNotThrow(()=>validateGeneratedCopy('Một chi tiết nhỏ bạn hay bỏ qua?\nĐối chiếu mô tả trước khi chọn.',180));assert.ok(hasDisclosure('Link affiliate: mình có thể nhận hoa hồng khi bạn mua qua link.'));
});
test('social migration preserves old posts while allowing Instagram with an owned image',async()=>{
 const db=new PGlite();const user='11111111-1111-4111-8111-111111111111';try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table affiliate_products(id uuid primary key);create table affiliate_product_images(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;insert into auth.users values('${user}');`);
  await db.exec(await readFile(new URL('../supabase/content.sql',import.meta.url),'utf8'));
  await db.exec(`insert into affiliate_content_posts(owner_id,channel,body,status,external_id) values('${user}','facebook','old','published','fb-kept');`);
  const sql=await readFile(new URL('../supabase/social-v2.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
  await db.exec(`insert into affiliate_content_posts(owner_id,channel,body) values('${user}','instagram','new');`);
  const {rows}=await db.query('select channel,external_id from affiliate_content_posts order by created_at');assert.ok(rows.some(r=>r.external_id==='fb-kept'));assert.ok(rows.some(r=>r.channel==='instagram'));
 }finally{await db.close();}
});
