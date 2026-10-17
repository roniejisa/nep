import assert from 'node:assert/strict';
import {readyIssues} from '../lib/product-readiness.ts';
import {AIError,isRecoverableAIError} from '../lib/ai-provider.ts';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import ts from 'typescript';
const source=await readFile(new URL('../lib/automation-rules.ts',import.meta.url),'utf8');
// Compile this pure module with its only dependency inlined for Node's native test runner.
const reelRules=await readFile(new URL('../lib/reel-rules.ts',import.meta.url),'utf8');
const rules=await readFile(new URL('../lib/content-rules.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(reelRules+'\n'+rules+'\n'+source.replace(/^import[^\n]+\n/gm,''),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {automationSettings,pickRandom,postingWindow,productMatches,imageChoices,scheduledDue,scheduleTimes,schedulePresets,slotFormats}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
test('automation rejects invalid channels, models and explicit state; random choice stays in pool',()=>{
 const cfg={enabled:true,channels:['threads'],provider:'gemini',model:'',copy_length:'tiny',daily_limit:24};
 assert.equal(automationSettings(cfg).daily_limit,24);
 for(const update of [{enabled:'true'},{channels:[]},{channels:['facebook','facebook']},{provider:'unknown'},{model:'../../secret'},{copy_length:'long'}])assert.throws(()=>automationSettings({...cfg,...update}));
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
async function workerFixture({target='123',afterGeneration=false,interrupted=false,publishError=false,tokenError=false,cfgOverride={},imagesOverride=[],videosOverride=[],generationError=null,interruptedBeforePublish=false,commentWarning=''}={}){
 let generated=0,published=0,paused=false;const logs=[],generationRequests=[];
 const cfg={enabled:true,channels:['facebook'],provider:'gemini',model:'',copy_length:'tiny',daily_limit:24,targets:{facebook:'123'},updated_at:'version1',...cfgOverride};
 const db={rpc:async(name)=>({data:name==='eligible_affiliate_products'?['product1']:name==='claim_affiliate_automation'?'job1':null,error:null}),from(table){let action='select',payload,columns='';const chain=new Proxy({},{get(_,prop){if(prop==='then')return resolve=>{
 let data=null;
 if(action==='select'){
 if(table==='affiliate_automation_settings')data=afterGeneration&&generated?{...cfg,enabled:false}:cfg;
 if(table==='affiliate_products')data=[{id:'product1',name:'Daily product',description:'Verified facts',affiliate_url:'https://example.com/link'}];
 if(table==='affiliate_product_images')data=imagesOverride;
 if(table==='affiliate_product_videos')data=videosOverride;
 if(table==='affiliate_content_posts')data=[{id:'unknownpost',status:'unknown'}];
 if(table==='affiliate_automation_jobs')data=columns==='slot'?{slot:'2026-10-16T08:00:00+07:00'}:columns==='id,post_id'&&(interrupted||interruptedBeforePublish)?[{id:'oldjob',post_id:interrupted?'unknownpost':null}]:[];
 }else{logs.push({table,payload});if(table==='affiliate_automation_settings'&&payload.enabled===false)paused=true;}
 return Promise.resolve({data,error:null}).then(resolve);
 };return (...args)=>{if(['select','update'].includes(prop)){action=prop;if(prop==='select')columns=args[0];else payload=args[0];}return chain;};}});return chain;}};
 const deps={readyIssues,AIError,isRecoverableAIError,database:()=>db,env:()=> 'owner1',generateContent:async(_db,_owner,input,retry)=>{generationRequests.push({input,retry});generated++;if(generationError)throw generationError;return {posts:[{id:'post1',body:'checked copy',image_id:null}]};},publishContent:async(_db,_owner,input)=>{assert.equal(input.expectedTargetId,'123');assert.equal(input.approved,true);published++;if(publishError)throw new Error('Meta result uncertain');return {warning:commentWarning};},socialTarget:async()=>({id:target}),instagramTarget:async()=>({id:target}),automationSettings,pickRandom,productMatches,imageChoices,slotFormats,assertPublishingQuota:async()=>{},scheduledDue:()=>true,postingWindow:()=>({period:'morning'}),metaRequest:async()=>{if(tokenError)throw new Error('Token invalid');return {id:'123'};},explainError:(e,stage)=>({kind:'unknown',stage,message:e.message,advice:'Check'}),configuredProviders:()=>({gemini:true})};
 globalThis.__automationDeps=deps;
 let src=await readFile(new URL('../lib/automation.ts',import.meta.url),'utf8');
 src=src.replace(/^import (?!.*node:crypto).*\n/gm,'');
 src="const {readyIssues,AIError,isRecoverableAIError,database,env,generateContent,publishContent,socialTarget,instagramTarget,automationSettings,pickRandom,postingWindow,productMatches,imageChoices,scheduledDue,metaRequest,explainError,configuredProviders,assertPublishingQuota,slotFormats}=globalThis.__automationDeps;\n"+src+'\n//'+Math.random();
 const code=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const worker=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 return {worker,stats:()=>({generated,published,paused,logs,generationRequests})};
}
test('hourly worker generates once and publishes only to the consented target',async()=>{
 const f=await workerFixture();assert.equal((await f.worker.runAutomation()).status,'done');assert.equal(f.stats().generated,1);assert.equal(f.stats().published,1);assert.equal(f.stats().paused,false);const request=f.stats().generationRequests[0];assert.equal(request.input.angle,'problem');assert.equal(request.input.length,'tiny');assert.equal(request.retry.maxAttempts,5);assert.equal(request.retry.delayMs,10000);assert.equal(request.retry.requestTimeoutMs,60000);assert.equal(request.retry.backoff,true);assert.equal(typeof request.retry.beforeAttempt,'function');
});
test('target changes, cancellation, interruptions and uncertain Meta errors prevent silent retries',async()=>{
 for(const [options,expectedGenerated,expectedPublished,expectedStatus] of [
 [{target:'999'},0,0,'failed'],[{tokenError:true},0,0,'failed'],[{afterGeneration:true},1,0,'skipped'],[{interrupted:true},0,0,'failed'],[{publishError:true},1,1,'failed']
 ]){
 const f=await workerFixture(options);assert.equal((await f.worker.runAutomation()).status,expectedStatus);assert.equal(f.stats().generated,expectedGenerated);assert.equal(f.stats().published,expectedPublished);assert.equal(f.stats().paused,expectedStatus==='failed');
 }
});
test('cron rejects missing, short and incorrect secrets',async()=>{
 const before=process.env.CRON_SECRET;try{const f=await workerFixture();delete process.env.CRON_SECRET;assert.equal(f.worker.cronAuthorized(null),false);process.env.CRON_SECRET='short';assert.equal(f.worker.cronAuthorized('Bearer short'),false);process.env.CRON_SECRET='a'.repeat(48);assert.equal(f.worker.cronAuthorized('Bearer '+'a'.repeat(48)),true);assert.equal(f.worker.cronAuthorized('Bearer '+'b'.repeat(48)),false);}finally{if(before===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=before;}
});

test('Vietnamese morning/evening boundaries exclude midday, overnight, and end hour',()=>{
 const at=h=>new Date(`2026-10-16T${String(h).padStart(2,'0')}:00:00+07:00`);
 for(const [h,period] of [[0,null],[6,null],[7,'morning'],[11,'morning'],[12,null],[17,null],[18,'evening'],[22,'evening'],[23,null]])assert.equal(postingWindow({},at(h)).period,period);
 assert.equal(postingWindow({},new Date('2026-10-15T23:59:00Z')).local_day,'2026-10-16');
 for(const hours of [{morning_start:12},{morning_end:13},{evening_start:11},{evening_end:25},{morning_start:7.123}])assert.throws(()=>automationSettings({enabled:true,channels:['facebook'],provider:'gemini',copy_length:'tiny',daily_limit:24,...hours}));
});
test('database limits a product across channels and cleanup deletes errors without losing posting slots',async()=>{
 const db=new PGlite(),owner='11111111-1111-4111-8111-111111111111',product='22222222-2222-4222-8222-222222222222';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${owner}');create table affiliate_products(id uuid primary key,owner_id uuid,status text);insert into affiliate_products values('${product}','${owner}','ready');create table affiliate_content_posts(id uuid primary key default gen_random_uuid(),owner_id uuid,product_id uuid,channel text,status text default 'draft',created_at timestamptz default now(),published_at timestamptz);`);
 await db.exec(await readFile(new URL('../supabase/automation.sql',import.meta.url),'utf8'));
 const sql=await readFile(new URL('../supabase/automation-controls.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 await db.exec(`insert into affiliate_automation_settings(owner_id,morning_start,morning_end,evening_start,evening_end) values('${owner}',0,12,12,24);`);
 assert.equal((await db.query(`select affiliate_posting_period('2026-10-16T07:00:00+07',7,12,18,23) p`)).rows[0].p,'morning');
 assert.equal((await db.query(`select affiliate_posting_period('2026-10-16T12:00:00+07',7,12,18,23) p`)).rows[0].p,null);
 const post=async(channel)=>(await db.query(`insert into affiliate_content_posts(owner_id,product_id,channel) values('${owner}','${product}',$1) returning id`,[channel])).rows[0].id;
 const a=await post('facebook'),b=await post('threads');
 const reserve=id=>db.query(`select reserve_affiliate_product_post('${owner}',$1) ok`,[id]);
 assert.equal((await reserve(a)).rows[0].ok,true);assert.equal((await reserve(a)).rows[0].ok,true);assert.equal((await reserve(b)).rows[0].ok,false);
 await db.exec(`update affiliate_content_posts set status='publishing' where id='${a}'`);
 await assert.rejects(db.query(`update affiliate_content_posts set status='publishing' where id='${b}'`));
 await db.exec(`insert into affiliate_automation_errors(owner_id,stage,kind,message,advice,expires_at) values('${owner}','publish','token','expired','reconnect',now()-interval '1 second'),('${owner}','ai','ai','recent','check',now()+interval '1 hour');select cleanup_affiliate_automation();`);
 assert.equal((await db.query('select count(*)::int n from affiliate_automation_errors')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from affiliate_product_post_slots')).rows[0].n,1);
 assert.equal((await reserve(b)).rows[0].ok,false);
 await db.exec(`set role authenticated`);await assert.rejects(db.query('select * from affiliate_automation_errors'));await assert.rejects(db.query(`select reserve_affiliate_product_post('${owner}','${a}')`));
 }finally{await db.close();}
});

test('selected products/categories and media limits stay within the eligible source',()=>{
 const defaults={enabled:true,channels:['facebook'],provider:'gemini',copy_length:'tiny',daily_limit:24};
 const id='11111111-1111-4111-8111-111111111111';
 const product={id,category:'Custom'};
 assert.equal(productMatches(product,automationSettings(defaults)),true);
 assert.equal(productMatches(product,automationSettings({...defaults,selection_mode:'products',selected_products:[id]})),true);
 assert.equal(productMatches(product,automationSettings({...defaults,selection_mode:'categories',selected_categories:['Other']})),false);
 for(const update of [{selection_mode:'products'},{selection_mode:'categories'},{max_images:11},{max_images:-1}])assert.throws(()=>automationSettings({...defaults,...update}));
 assert.deepEqual(imageChoices(['a','b'],5,()=>0),['a','b']);assert.deepEqual(imageChoices(['a','b'],0),[]);
 assert.equal(postingWindow({morning_start:7.5},new Date('2026-10-16T07:29:00+07:00')).period,null);
 assert.equal(postingWindow({morning_start:7.5},new Date('2026-10-16T07:30:00+07:00')).period,'morning');
});

test('no image automatically removes Instagram from the random candidate pool',async()=>{
 const mixed=await workerFixture({cfgOverride:{channels:['instagram','facebook'],max_images:5}});
 assert.equal((await mixed.worker.runAutomation()).status,'done');
 const picked=mixed.stats().logs.find(l=>l.table==='affiliate_automation_jobs'&&l.payload?.channel);
 assert.equal(picked.payload.channel,'facebook');
 const igOnly=await workerFixture({cfgOverride:{channels:['instagram'],max_images:0}});assert.equal((await igOnly.worker.runAutomation()).status,'skipped');assert.equal(igOnly.stats().generated,0);assert.equal(igOnly.stats().paused,false);
 const filtered=await workerFixture({cfgOverride:{selection_mode:'categories',selected_categories:['Not this category']}});assert.equal((await filtered.worker.runAutomation()).status,'skipped');assert.equal(filtered.stats().generated,0);
});

test('explicit schedules support 6/8/10 slots, reject duplicates/close times and only become due within grace',()=>{
 for(const count of ['6','8','10'])assert.equal(scheduleTimes(schedulePresets[count]).length,Number(count));
 for(const times of [[],['24:00'],['7:00'],['07:00','07:00'],['07:00','07:10'],['23:55','00:05']])assert.throws(()=>scheduleTimes(times));
 const cfg={schedule_mode:'times',schedule_times:['07:00','09:00','14:00']};
 assert.equal(scheduledDue(cfg,new Date('2026-10-16T06:59:00+07:00')),false);
 assert.equal(scheduledDue(cfg,new Date('2026-10-16T07:04:00+07:00')),true);
 assert.equal(scheduledDue(cfg,new Date('2026-10-16T07:05:00+07:00')),false);
 assert.equal(scheduledDue(cfg,new Date('2026-10-16T14:00:00+07:00')),true);
});

test('automation honors Reel-only, mixed availability and per-slot overrides using the product video',async()=>{
 const video={id:'video1',product_id:'product1'};
 const reel=await workerFixture({cfgOverride:{format_mode:'reel',channels:['facebook','instagram'],targets:{facebook:'123',instagram:'123'}},videosOverride:[video]});
 assert.equal((await reel.worker.runAutomation()).status,'done');
 const request=reel.stats().generationRequests[0];assert.equal(request.input.postFormat,'reel');assert.equal(request.input.videoId,'video1');assert.deepEqual(request.input.imageIds,[]);assert.ok(!request.input.channels.includes('threads'));
 const noVideo=await workerFixture({cfgOverride:{format_mode:'reel'}});assert.equal((await noVideo.worker.runAutomation()).status,'skipped');assert.equal(noVideo.stats().generated,0);
 const wrongProduct=await workerFixture({cfgOverride:{format_mode:'reel'},videosOverride:[{id:'other-video',product_id:'other-product'}]});assert.equal((await wrongProduct.worker.runAutomation()).status,'skipped');
 const mixed=await workerFixture({cfgOverride:{format_mode:'mixed'}});assert.equal((await mixed.worker.runAutomation()).status,'done');assert.equal(mixed.stats().generationRequests[0].input.postFormat,'feed');
 const overridden=await workerFixture({cfgOverride:{format_mode:'feed',schedule_mode:'times',schedule_times:['08:00','10:00'],slot_formats:{'08:00':'reel'}},videosOverride:[video]});assert.equal((await overridden.worker.runAutomation()).status,'done');assert.equal(overridden.stats().generationRequests[0].input.postFormat,'reel');
});

test('recoverable AI failures skip only the current slot, while bad credentials and unknown Meta results still pause',async()=>{
 for(const error of [new AIError('503 overloaded',{reason:'http',httpStatus:503,retryable:true}),new AIError('timeout',{reason:'timeout',retryable:true}),new AIError('length repair failed',{reason:'validation',retryable:true})]){
  const f=await workerFixture({generationError:error});const result=await f.worker.runAutomation();assert.equal(result.status,'skipped');assert.ok(result.message.includes('Lịch vẫn bật'));assert.equal(f.stats().paused,false);assert.equal(f.stats().generated,1);assert.equal(f.stats().published,0);
 }
 const permanent=await workerFixture({generationError:new AIError('AI 401',{reason:'http',httpStatus:401,retryable:false})});assert.equal((await permanent.worker.runAutomation()).status,'failed');assert.equal(permanent.stats().paused,true);
 const interrupted=await workerFixture({interruptedBeforePublish:true});assert.equal((await interrupted.worker.runAutomation()).status,'done');assert.equal(interrupted.stats().paused,false);
 const cancelled=await workerFixture({generationError:new AIError('cancelled',{reason:'cancelled',retryable:true})});assert.equal((await cancelled.worker.runAutomation()).status,'skipped');assert.equal(cancelled.stats().published,0);assert.equal(cancelled.stats().paused,false);
});

test('comment failure is visible in cron history without republishing or pausing the schedule',async()=>{
 const f=await workerFixture({commentWarning:'Bài đã đăng. Chưa gửi được bình luận; kiểm tra quyền.'});
 const result=await f.worker.runAutomation();assert.equal(result.status,'done');assert.match(result.message,/Chưa gửi được bình luận/);assert.equal(f.stats().paused,false);assert.equal(f.stats().published,1);
});
