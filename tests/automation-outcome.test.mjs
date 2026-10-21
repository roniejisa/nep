import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import ts from 'typescript';
import {automationFailureSummary} from '../lib/automation-outcome.ts';
test('safe summaries retain classification and codes without retaining raw error details',()=>{
 const detail={kind:'token',stage:'publish',http_status:400,error_code:190,error_subcode:463,message:'secret=private https://example.com/private',advice:'provider private text'};
 const text=automationFailureSummary(detail,'threads',true);assert.match(text,/HTTP 400/);assert.match(text,/mã 190/);assert.match(text,/463/);assert.match(text,/threads/);assert.match(text,/không tự gửi lại/);assert.ok(!text.includes('private'));assert.ok(!text.includes('https://'));
 const missing=automationFailureSummary({kind:'unknown',stage:'unexpected-secret'},'private-channel',false);assert.ok(!missing.includes('secret'));assert.ok(!missing.includes('private-channel'));assert.match(missing,/Chưa lưu được/);
});
test('8h detailed-error cleanup does not destroy safe summaries of newly skipped runs or slot uniqueness',async()=>{
 const db=new PGlite(),owner='11111111-1111-4111-8111-111111111111';try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${owner}');create table affiliate_products(id uuid primary key,owner_id uuid,status text);create table affiliate_content_posts(id uuid primary key,owner_id uuid,product_id uuid,status text,created_at timestamptz,published_at timestamptz);`);
  for(const file of ['automation.sql','automation-controls.sql'])await db.exec(await readFile(new URL('../supabase/'+file,import.meta.url),'utf8'));
  const message=automationFailureSummary({kind:'token',stage:'token_check',http_status:400,error_code:190,error_subcode:463},'threads',true);
  await db.query(`insert into affiliate_automation_jobs(owner_id,slot,status,message,created_at,finished_at) values($1,now()-interval '9 hours','skipped',$2,now()-interval '9 hours',now()-interval '9 hours')`,[owner,message]);
  await db.exec(`insert into affiliate_automation_errors(owner_id,stage,kind,message,advice,expires_at) values('${owner}','token_check','token','old detail','reconnect',now()-interval '1 minute');select cleanup_affiliate_automation();`);
  assert.equal((await db.query('select count(*)::int n from affiliate_automation_errors')).rows[0].n,0);assert.equal((await db.query('select message from affiliate_automation_jobs')).rows[0].message,message);
  await assert.rejects(db.query(`insert into affiliate_automation_jobs(owner_id,slot) select owner_id,slot from affiliate_automation_jobs`));
 }finally{await db.close();}
});
test('cron errors return skipped outcomes without weakening secret authentication or replaying the request',async()=>{
 const source=await readFile(new URL('../app/api/automation/cron/route.ts',import.meta.url),'utf8');
 const code=ts.transpileModule(source.replace(/^import[^\n]+\n/gm,''),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};let runs=0;
 new Function('module','exports','cronAuthorized','runAutomation','explainError','console',code)(module,module.exports,header=>header==='Bearer test',async()=>{runs++;throw new Error('secret bootstrap message');},()=>({kind:'database',stage:'database'}),{error:()=>{}});
 const denied=await module.exports.POST(new Request('https://local.test'));assert.equal(denied.status,401);assert.equal(runs,0);
 const response=await module.exports.POST(new Request('https://local.test',{headers:{Authorization:'Bearer test'}}));assert.equal(response.status,200);const result=await response.json();assert.equal(result.status,'skipped');assert.ok(!JSON.stringify(result).includes('secret'));assert.equal(runs,1);
});
