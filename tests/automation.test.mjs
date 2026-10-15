import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import ts from 'typescript';
const source=await readFile(new URL('../lib/automation-rules.ts',import.meta.url),'utf8');
// Compile this pure module with its only dependency inlined for Node's native test runner.
const rules=await readFile(new URL('../lib/content-rules.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(rules+'\n'+source.replace(/^import[^\n]+\n/,''),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {automationSettings,pickRandom}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
test('automation rejects invalid channels, models, budgets and explicit state; random choice stays in pool',()=>{
 const cfg={enabled:true,channels:['threads'],provider:'gemini',model:'',copy_length:'tiny',daily_limit:24};
 assert.equal(automationSettings(cfg).daily_limit,24);
 for(const update of [{enabled:'true'},{channels:[]},{channels:['facebook','facebook']},{provider:'unknown'},{model:'../../secret'},{daily_limit:25},{daily_limit:0},{copy_length:'long'}])assert.throws(()=>automationSettings({...cfg,...update}));
 assert.equal(pickRandom(['a','b'],()=>0),'a');assert.equal(pickRandom(['a','b'],()=>.9999),'b');assert.throws(()=>pickRandom([]));
});
test('database claim is idempotent, respects off switch and daily cap, and denies browser access',async()=>{
 const db=new PGlite();const user='11111111-1111-4111-8111-111111111111';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${user}');create table affiliate_products(id uuid primary key);create table affiliate_content_posts(id uuid primary key);`);
 const sql=await readFile(new URL('../supabase/automation.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 const claim=async()=> (await db.query(`select claim_affiliate_automation('${user}') as id`)).rows[0].id;
 assert.equal(await claim(),null);
 await db.exec(`insert into affiliate_automation_settings(owner_id,enabled,daily_limit) values('${user}',true,1)`);
 assert.ok(await claim());assert.equal(await claim(),null);
 await db.exec(`update affiliate_automation_jobs set status='done',slot=slot-interval '1 hour'`);
 assert.equal(await claim(),null); // daily cap includes attempts
 await db.exec(`update affiliate_automation_settings set daily_limit=24`);
 assert.ok(await claim());
 await db.exec(`update affiliate_automation_jobs set status='done';update affiliate_automation_settings set enabled=false`);assert.equal(await claim(),null);
 await db.exec('set role authenticated');await assert.rejects(claim());await assert.rejects(db.query('select * from affiliate_automation_settings'));await db.exec('reset role');
 }finally{await db.close();}
});
async function workerFixture({target='123',afterGeneration=false,interrupted=false,publishError=false}={}){
 let generated=0,published=0,paused=false;const logs=[];
 const cfg={enabled:true,channels:['facebook'],provider:'gemini',model:'',copy_length:'tiny',daily_limit:24,targets:{facebook:'123'},updated_at:'version1'};
 const db={rpc:async()=>({data:'job1',error:null}),from(table){let action='select',payload,columns='';const chain=new Proxy({},{get(_,prop){if(prop==='then')return resolve=>{
 let data=null;
 if(action==='select'){
 if(table==='affiliate_automation_settings')data=afterGeneration&&generated?{...cfg,enabled:false}:cfg;
 if(table==='affiliate_products')data=[{id:'product1',name:'Daily product',description:'Verified facts',affiliate_url:'https://example.com/link'}];
 if(table==='affiliate_product_images')data=[];
 if(table==='affiliate_automation_jobs')data=columns==='id'&&interrupted?[{id:'oldjob'}]:[];
 }else{logs.push({table,payload});if(table==='affiliate_automation_settings'&&payload.enabled===false)paused=true;}
 return Promise.resolve({data,error:null}).then(resolve);
 };return (...args)=>{if(['select','update'].includes(prop)){action=prop;if(prop==='select')columns=args[0];else payload=args[0];}return chain;};}});return chain;}};
 const deps={database:()=>db,env:()=> 'owner1',generateContent:async()=>{generated++;return {posts:[{id:'post1',body:'checked copy',image_id:null}]};},publishContent:async(_db,_owner,input)=>{assert.equal(input.expectedTargetId,'123');assert.equal(input.approved,true);published++;if(publishError)throw new Error('Meta result uncertain');},socialTarget:async()=>({id:target}),instagramTarget:async()=>({id:target}),automationSettings,pickRandom,configuredProviders:()=>({gemini:true})};
 globalThis.__automationDeps=deps;
 let src=await readFile(new URL('../lib/automation.ts',import.meta.url),'utf8');
 src=src.replace(/^import (?!.*node:crypto).*\n/gm,'');
 src="const {database,env,generateContent,publishContent,socialTarget,instagramTarget,automationSettings,pickRandom,configuredProviders}=globalThis.__automationDeps;\n"+src+'\n//'+Math.random();
 const code=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const worker=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 return {worker,stats:()=>({generated,published,paused,logs})};
}
test('hourly worker generates once and publishes only to the consented target',async()=>{
 const f=await workerFixture();assert.equal((await f.worker.runAutomation()).status,'done');assert.equal(f.stats().generated,1);assert.equal(f.stats().published,1);assert.equal(f.stats().paused,false);
});
test('target changes, cancellation, interruptions and uncertain Meta errors prevent silent retries',async()=>{
 for(const [options,expectedGenerated,expectedPublished,expectedStatus] of [
 [{target:'999'},0,0,'failed'],[{afterGeneration:true},1,0,'skipped'],[{interrupted:true},0,0,'failed'],[{publishError:true},1,1,'failed']
 ]){
 const f=await workerFixture(options);assert.equal((await f.worker.runAutomation()).status,expectedStatus);assert.equal(f.stats().generated,expectedGenerated);assert.equal(f.stats().published,expectedPublished);assert.equal(f.stats().paused,expectedStatus==='failed');
 }
});
test('cron rejects missing, short and incorrect secrets',async()=>{
 const before=process.env.CRON_SECRET;try{const f=await workerFixture();delete process.env.CRON_SECRET;assert.equal(f.worker.cronAuthorized(null),false);process.env.CRON_SECRET='short';assert.equal(f.worker.cronAuthorized('Bearer short'),false);process.env.CRON_SECRET='a'.repeat(48);assert.equal(f.worker.cronAuthorized('Bearer '+'a'.repeat(48)),true);assert.equal(f.worker.cronAuthorized('Bearer '+'b'.repeat(48)),false);}finally{if(before===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=before;}
});
