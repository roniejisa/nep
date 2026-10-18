import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const source=await readFile(new URL('../lib/automation-rules.ts',import.meta.url),'utf8'),copy=await readFile(new URL('../lib/content-rules.ts',import.meta.url),'utf8'),reels=await readFile(new URL('../lib/reel-rules.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(reels+'\n'+copy+'\n'+source.replace(/^import[^\n]+\n/gm,''),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {scheduleTimes,intervalTimes,pastedTimes,automationSettings}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
test('minute schedules accept 48, 96 and all 1,440 distinct minute slots with no artificial spacing cap',()=>{
 for(const [step,count] of [[30,48],[15,96],[1,1440]])assert.equal(scheduleTimes(intervalTimes('00:00','23:59',step)).length,count);
 assert.deepEqual(scheduleTimes(['07:01','07:00']),['07:00','07:01']);assert.deepEqual(scheduleTimes(['23:59','00:00']),['00:00','23:59']);
 const cfg=automationSettings({enabled:false,channels:['facebook'],provider:'gemini',copy_length:'tiny',schedule_mode:'times',schedule_times:intervalTimes('00:00','23:59',1),slot_formats:{'07:01':'reel'}});
 assert.equal(cfg.schedule_times.length,1440);assert.equal(cfg.slot_formats['07:01'],'reel');assert.equal('daily_limit' in cfg,false);
 for(const times of [[],['24:00'],['07:60'],['07:00','07:00'],[null]])assert.throws(()=>scheduleTimes(times));
});
test('quick interval generation supports midnight and pasted lists merge duplicate user input',()=>{
 assert.deepEqual(intervalTimes('23:58','00:02',1),['00:00','00:01','00:02','23:58','23:59']);assert.equal(intervalTimes('07:00','08:00',5).length,13);
 assert.deepEqual(pastedTimes('7:00, 07:01;07:00\n23:59'),['07:00','07:01','23:59']);
 for(const args of [['00:00','23:59',0],['00:00','23:59',1.5],['25:00','23:59',5]])assert.throws(()=>intervalTimes(...args));assert.throws(()=>pastedTimes('07:00,broken'));
});
async function fixture(existing=false){
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');create function auth.uid() returns uuid language sql as $$select null::uuid$$;create table affiliate_products(id uuid primary key,owner_id uuid,category text default 'Khác',status text default 'ready');create table affiliate_product_images(id uuid primary key);`);
 for(const file of ['content.sql','social-v2.sql','automation.sql','automation-controls.sql','automation-flex.sql','automation-times.sql','automation-unrestricted.sql'])await db.exec(await readFile(new URL('../supabase/'+file,import.meta.url),'utf8'));
 if(existing)await db.exec(`insert into affiliate_automation_settings(owner_id,enabled,schedule_mode,schedule_times,updated_at) values('${owner}',true,'times','["07:00","09:00"]','2026-10-16T00:00:00+07');`);
 const migration=await readFile(new URL('../supabase/automation-dense-schedule.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
 if(!existing)await db.exec(`insert into affiliate_automation_settings(owner_id,enabled,schedule_mode,schedule_times,daily_limit,updated_at,dense_schedule_started_at) values('${owner}',true,'times','["07:00","07:01","07:02"]',1,'2026-10-16T06:00:00+07','2026-10-16T00:00:00+07');`);
 const due=async(time,id=owner)=>(await db.query('select due_affiliate_slot($1,$2::timestamptz) slot',[id,time])).rows[0].slot;
 return {db,due};
}
test('SQL permits dense schedules but keeps strict time validation and does not overwrite saved settings',async()=>{
 const f=await fixture();try{
  await f.db.query('update affiliate_automation_settings set schedule_times=$1::jsonb where owner_id=$2',[JSON.stringify(intervalTimes('00:00','23:59',1)),owner]);
  assert.equal((await f.db.query('select jsonb_array_length(schedule_times) n,enabled,daily_limit from affiliate_automation_settings')).rows[0].n,1440);
  for(const value of [null,{},[],['07:00','07:00'],[null],[7],['7:00'],['24:00']])assert.equal((await f.db.query('select valid_affiliate_schedule($1::jsonb) ok',[JSON.stringify(value)])).rows[0].ok,false);
  assert.equal((await f.db.query('select enabled,daily_limit from affiliate_automation_settings')).rows[0].daily_limit,1);
 }finally{await f.db.close();}
});
test('SQL drains earliest unclaimed slots rather than losing nearby or delayed times and handles midnight',async()=>{
 const f=await fixture();try{
  assert.equal(new Date(await f.due('2026-10-16T07:09:00+07')).toISOString(),'2026-10-16T00:00:00.000Z','missed the old 5-minute window but remains queued');
  await f.db.exec(`insert into affiliate_automation_jobs(owner_id,slot,status) values('${owner}','2026-10-16T07:00:00+07','done');`);
  assert.equal(new Date(await f.due('2026-10-16T07:09:00+07')).toISOString(),'2026-10-16T00:01:00.000Z');
  await f.db.exec(`insert into affiliate_automation_jobs(owner_id,slot,status) values('${owner}','2026-10-16T07:01:00+07','failed'),('${owner}','2026-10-16T07:02:00+07','skipped');`);
  assert.equal(await f.due('2026-10-16T07:09:00+07'),null,'claimed failures are not automatically reposted');
  await f.db.exec(`update affiliate_automation_settings set schedule_times='["23:59","00:00","00:01"]',updated_at='2026-10-16T23:58:00+07'`);
  assert.equal(new Date(await f.due('2026-10-17T00:02:00+07')).toISOString(),'2026-10-16T16:59:00.000Z');
  assert.equal(await f.due('2026-10-16T23:58:00+07'),null,'saving does not create a historical morning backlog');
  await f.db.exec(`update affiliate_automation_settings set enabled=false`);assert.equal(await f.due('2026-10-17T00:02:00+07'),null);
 }finally{await f.db.close();}
});
test('claims remain serialized and unique without consulting legacy daily_limit; private RPC permissions remain enforced',async()=>{
 const f=await fixture();try{
  await f.db.exec(`update affiliate_automation_settings set schedule_times=(select jsonb_agg(to_char(v at time zone 'Asia/Ho_Chi_Minh','HH24:MI')) from generate_series(date_trunc('minute',now())-interval '3 minutes',date_trunc('minute',now()),interval '1 minute') v),updated_at=now()-interval '4 minutes';`);
  const claim=async()=>(await f.db.query('select claim_affiliate_automation($1) id',[owner])).rows[0].id;
  const slots=[];for(let i=0;i<4;i++){const job=await claim();assert.ok(job);assert.equal(await claim(),null,'one active worker per owner');slots.push((await f.db.query('select slot from affiliate_automation_jobs where id=$1',[job])).rows[0].slot);await f.db.query("update affiliate_automation_jobs set status='done' where id=$1",[job]);}
  assert.equal(new Set(slots.map(s=>new Date(s).toISOString())).size,4);assert.equal(await claim(),null);assert.equal(await f.due(new Date().toISOString(),other),null);
  const migration=await readFile(new URL('../supabase/automation-dense-schedule.sql',import.meta.url),'utf8');await f.db.exec(migration);assert.equal(await claim(),null,'rerunning migration cannot repost slots');
  await f.db.exec('set role authenticated');await assert.rejects(claim());await assert.rejects(f.due('2026-10-17T07:00:00+07'));await f.db.exec('set role anon');await assert.rejects(claim());
 }finally{await f.db.close();}
});

test('first installation anchors existing schedules now and rerunning SQL preserves the anchor and settings',async()=>{
 const f=await fixture(true);try{
  const saved=(await f.db.query('select * from affiliate_automation_settings')).rows[0];assert.equal(saved.enabled,true);assert.deepEqual(saved.schedule_times,['07:00','09:00']);assert.equal(new Date(saved.updated_at).toISOString(),'2026-10-15T17:00:00.000Z');
  assert.equal(await f.due('2026-10-16T07:02:00+07'),null,'first install does not resurrect historical missed slots');
  const migration=await readFile(new URL('../supabase/automation-dense-schedule.sql',import.meta.url),'utf8');await f.db.exec(migration);
  assert.equal(new Date((await f.db.query('select dense_schedule_started_at from affiliate_automation_settings')).rows[0].dense_schedule_started_at).toISOString(),new Date(saved.dense_schedule_started_at).toISOString());
 }finally{await f.db.close();}
});
