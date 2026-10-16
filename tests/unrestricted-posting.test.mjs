import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import ts from 'typescript';

test('upgrade removes product/day caps for all channels while preserving slot claims and private permissions',async()=>{
 const db=new PGlite(),owner='11111111-1111-4111-8111-111111111111',product='22222222-2222-4222-8222-222222222222';
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${owner}');create function auth.uid() returns uuid language sql as $$select null::uuid$$;create table affiliate_products(id uuid primary key,owner_id uuid,category text default 'Khác',status text default 'ready');insert into affiliate_products(id,owner_id) values('${product}','${owner}');create table affiliate_product_images(id uuid primary key);`);
  for(const file of ['content.sql','social-v2.sql','automation.sql','automation-controls.sql','automation-flex.sql','automation-times.sql'])await db.exec(await readFile(new URL('../supabase/'+file,import.meta.url),'utf8'));
  await db.exec(`insert into affiliate_automation_settings(owner_id,enabled,schedule_mode,schedule_times,daily_limit,provider,model,copy_length) values('${owner}',true,'times',jsonb_build_array(to_char(now() at time zone 'Asia/Ho_Chi_Minh','HH24:MI')),1,'openai','old-model','short');
    insert into affiliate_automation_jobs(owner_id,slot,status) select '${owner}',(date_trunc('day',now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh')+n*interval '1 second','failed' from generate_series(1,40) n;`);
  const claim=async()=>(await db.query(`select claim_affiliate_automation('${owner}') id`)).rows[0].id;
  assert.equal(await claim(),null,'old daily cap blocks despite a due schedule');
  const upgrade=await readFile(new URL('../supabase/automation-unrestricted.sql',import.meta.url),'utf8');await db.exec(upgrade);await db.exec(upgrade);
  const saved=(await db.query('select * from affiliate_automation_settings')).rows[0];
  assert.equal(saved.enabled,true);assert.equal(saved.daily_limit,1);assert.equal(saved.model,'gemini-3.5-flash-lite');assert.equal(saved.provider,'gemini');assert.equal(saved.copy_length,'tiny');
  assert.ok(await claim(),'over 30 previous attempts do not block the next scheduled slot');assert.equal(await claim(),null,'one active claim only');
  await db.exec(`update affiliate_automation_jobs set status='done'`);assert.equal(await claim(),null,'same scheduled slot cannot be claimed again');
  for(const channel of ['facebook','threads','instagram','facebook','threads','instagram']){
   const id=(await db.query(`insert into affiliate_content_posts(owner_id,product_id,channel,body) values('${owner}','${product}',$1,'new copy') returning id`,[channel])).rows[0].id;
   const reserve=async ownerId=>(await db.query('select reserve_affiliate_product_post($1,$2) ok',[ownerId,id])).rows[0].ok;
   assert.equal(await reserve('33333333-3333-4333-8333-333333333333'),false);
   assert.equal(await reserve(owner),true);
   await db.query("update affiliate_content_posts set status='publishing' where id=$1 and status='draft'",[id]);
   assert.equal(await reserve(owner),false,'same post cannot be sent again');
   await db.query("update affiliate_content_posts set status='published' where id=$1",[id]);
  }
  assert.equal((await db.query(`select * from eligible_affiliate_products('${owner}')`)).rows.length,1,'product remains eligible after repeated posts');
  assert.equal((await db.query('select count(*)::int n from affiliate_content_posts')).rows[0].n,6);
  await db.exec(`insert into affiliate_automation_errors(owner_id,stage,kind,message,advice,expires_at) values('${owner}','ai','ai','expired','check',now()-interval '1 second');select cleanup_affiliate_automation();`);
  assert.equal((await db.query('select count(*)::int n from affiliate_automation_errors')).rows[0].n,0);
  await db.exec('set role authenticated');await assert.rejects(claim());await assert.rejects(db.query(`select * from eligible_affiliate_products('${owner}')`));await assert.rejects(db.query('select * from affiliate_automation_settings'));
  await db.exec('set role anon');await assert.rejects(db.query('select * from affiliate_content_posts'));
 }finally{await db.close();}
});

test('five AI attempts share one run lock and save one draft, without a 30/day counter',async()=>{
 let source=await readFile(new URL('../lib/content-generate.ts',import.meta.url),'utf8');
 for(const name of ['post-images','ai-provider','content-rules'])source=source.replaceAll(`@/lib/${name}`,new URL(`../lib/${name}.ts`,import.meta.url).href);
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {generateContent}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const original=globalThis.fetch,key=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-key';
 let calls=0,runInserts=0,draftInserts=0,counters=0;const statuses=[];
 const product={id:'product',name:'Nước giặt',description:'Thông tin nguồn.',category:'Nước giặt',variant:'Túi',affiliate_url:'https://example.com/affiliate'};
 const db={from(table){let action='select',payload;const chain=new Proxy({},{get(_,prop){if(prop==='then')return resolve=>{
   let data=null;
   if(table==='affiliate_products')data=product;
   if(table==='affiliate_content_runs'&&action==='insert'){runInserts++;data={id:'one-run'};}
   if(table==='affiliate_content_runs'&&action==='update')statuses.push(payload.status);
   if(table==='affiliate_content_posts'&&action==='insert'){draftInserts++;data=payload.map((row,i)=>({...row,id:'post'+i}));}
   return Promise.resolve({data,error:null,count:100}).then(resolve);
  };return(...args)=>{if(prop==='insert'||prop==='update'){action=prop;payload=args[0];}if(prop==='select'&&args[1]?.count)counters++;return chain;};}});return chain;}};
 try{
  globalThis.fetch=async()=>{calls++;if(calls<5)return Response.json({error:'temporary'},{status:503});return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({facebook:'Áo giặt xong vẫn lo mùi?\nXem mô tả trước khi chọn.',threads:'Một ý ngắn.',instagram:'Một ý ngắn.',review:'Kiểm tra nguồn.'})}]}}],usageMetadata:{totalTokenCount:70}});};
  const result=await generateContent(db,'owner',{productId:'product',provider:'gemini',model:'gemini-3.5-flash-lite',channels:['facebook'],length:'tiny',angle:'problem',imageIds:[]},{maxAttempts:5,pause:async()=>{}});
  assert.equal(calls,5);assert.equal(result.attempts,5);assert.equal(runInserts,1);assert.equal(draftInserts,1);assert.equal(counters,0);assert.equal(result.posts.length,1);assert.ok(result.posts[0].body.endsWith(product.affiliate_url));assert.ok(statuses.includes('done'));
 }finally{globalThis.fetch=original;if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;}
});
