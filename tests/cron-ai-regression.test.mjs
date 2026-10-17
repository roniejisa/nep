import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {generateCopy,AIError} from '../lib/ai-provider.ts';
import {contentBrief,normalizeGeneratedCopy,validateGeneratedCopy} from '../lib/content-rules.ts';
import {explainError} from '../lib/operation-error.ts';

const good='Áo giặt xong vẫn lo mùi?\nXem mô tả để chọn đúng loại.';
const ok=(text=good,thought=false)=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[...(thought?[{thought:true,text:'private reasoning is not a JSON response'}]:[]),{text:JSON.stringify({facebook:text,review:'Kiểm tra nguồn.'})}]}}],usageMetadata:{totalTokenCount:80}});
async function mocked(run){const fetch=globalThis.fetch,key=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-key';try{return await run();}finally{globalThis.fetch=fetch;if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;}}
const validate=output=>{output.facebook=normalizeGeneratedCopy(output.facebook);validateGeneratedCopy(output.facebook,150);};

test('reproduces Short succeeding while Tiny fails, then repairs the previous draft rather than restarting blindly',async()=>mocked(async()=>{
 const long='Áo giặt xong vẫn lo mùi?\n'+('Một dữ kiện trong mô tả nguồn. '.repeat(6)).trim();
 assert.doesNotThrow(()=>validateGeneratedCopy(long,260));assert.throws(()=>validateGeneratedCopy(long,150));
 let calls=0;const bodies=[];
 globalThis.fetch=async(_url,options)=>{calls++;const body=JSON.parse(options.body);bodies.push(body);return ok(calls===1?long:good,true);};
 const brief=contentBrief('tiny','problem',['facebook']);
 const result=await generateCopy(brief.instructions,'{"name":"Nước giặt"}',{provider:'gemini',model:'gemini-3.5-flash-lite'},{channels:['facebook'],limits:brief.limits,maxAttempts:5,maxRepairs:1,validate,pause:async()=>{}});
 assert.equal(calls,2);assert.equal(result.tokens,160);assert.equal(result.output.facebook,good);assert.equal(result.output.threads,'');
 assert.deepEqual(bodies[0].generationConfig.responseSchema.required,['facebook','review']);assert.ok(!Object.hasOwn(bodies[0].generationConfig.responseSchema.properties,'instagram'));
 const repair=JSON.parse(bodies[1].contents[0].parts[0].text);assert.equal(repair.previous_draft.facebook,long);assert.ok(repair.correction.includes('150'));assert.ok(bodies[1].systemInstruction.parts[0].text.includes('SỬA BẢN TRƯỚC'));
}));

test('normalizes spacing and extra line breaks without losing facts or spending a repair call',async()=>mocked(async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return ok('  Áo giặt xong vẫn lo mùi?\r\n\n Một dữ kiện.\n Một lưu ý.\n Xem mô tả. ');};
 const result=await generateCopy('i','p',{provider:'gemini'},{channels:['facebook'],maxAttempts:5,validate,pause:async()=>assert.fail('No retry needed')});
 assert.equal(calls,1);assert.equal(result.output.facebook,'Áo giặt xong vẫn lo mùi?\nMột dữ kiện. Một lưu ý. Xem mô tả.');
}));

test('503 backs off within five calls and exposes HTTP/reason rather than a generic key warning',async()=>mocked(async()=>{
 let calls=0;const waits=[],events=[];
 globalThis.fetch=async()=>{calls++;return Response.json({error:{message:'secret upstream text'}},{status:503});};
 await assert.rejects(generateCopy('i','p',{provider:'gemini'},{maxAttempts:5,backoff:true,pause:async ms=>waits.push(ms),onFailure:async(e,n,retry,context)=>events.push({e,n,retry,context})}),error=>error instanceof AIError&&error.httpStatus===503&&error.reason==='http'&&error.retryable&&error.attempts===5&&!error.message.includes('secret upstream'));
 assert.equal(calls,5);assert.deepEqual(waits,[10000,20000,40000,60000]);assert.equal(events[0].context.requestTimeoutMs,60000);
 const detail=explainError(events[0].e,'ai');assert.equal(detail.http_status,503);assert.ok(detail.advice.includes('quá tải'));assert.ok(!detail.advice.includes('API key'));
}));

test('Retry-After is respected and permanent credentials/model errors do not consume all five attempts',async()=>mocked(async()=>{
 let calls=0;const waits=[];
 globalThis.fetch=async()=>++calls===1?Response.json({}, {status:429,headers:{'Retry-After':'45'}}):ok();
 await generateCopy('i','p',{provider:'gemini'},{channels:['facebook'],maxAttempts:5,backoff:true,pause:async ms=>waits.push(ms)});assert.deepEqual(waits,[45000]);
 for(const status of [400,401,403,404]){calls=0;globalThis.fetch=async()=>{calls++;return Response.json({}, {status});};await assert.rejects(generateCopy('i','p',{provider:'gemini'},{maxAttempts:5,pause:async()=>assert.fail()}),e=>e instanceof AIError&&e.httpStatus===status&&!e.retryable);assert.equal(calls,1);}
 calls=0;globalThis.fetch=async()=>{calls++;return Response.json({}, {status:429,headers:{'Retry-After':'3600'}});};
 await assert.rejects(generateCopy('i','p',{provider:'gemini'},{maxAttempts:5,deadline:Date.now()+200000,pause:async()=>assert.fail()}),e=>e.retryable&&e.httpStatus===429);assert.equal(calls,1);
}));

test('timeout, network and JSON errors remain distinguishable',async()=>mocked(async()=>{
 for(const [reason,response] of [['timeout',()=>{throw new DOMException('timeout','TimeoutError');}],['network',()=>{throw new TypeError('fetch failed private URL');}],['json',()=>new Response('invalid-json',{status:200})]]){
  globalThis.fetch=async()=>response();await assert.rejects(generateCopy('i','p',{provider:'gemini'}),e=>e instanceof AIError&&e.reason===reason&&!e.message.includes('private URL'));
 }
}));

test('a second failed content check stops at two calls, retaining observed usage instead of paying for five drafts',async()=>mocked(async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return ok('x'.repeat(500));};
 await assert.rejects(generateCopy('i','p',{provider:'gemini'},{channels:['facebook'],maxAttempts:5,maxRepairs:1,validate,pause:async()=>{}}),e=>e instanceof AIError&&e.reason==='validation'&&e.attempts===2&&e.tokens===160&&e.retryable);assert.equal(calls,2);
}));

test('pausing during retry prevents further paid calls',async()=>mocked(async()=>{
 let active=true,calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({}, {status:503});};
 await assert.rejects(generateCopy('i','p',{provider:'gemini'},{maxAttempts:5,beforeAttempt:async()=>{if(!active)throw new AIError('cancelled',{reason:'cancelled',retryable:true});},pause:async()=>{active=false;}}),e=>e instanceof AIError&&e.reason==='cancelled');assert.equal(calls,1);
}));

test('selected-channel schemas remain valid for Claude and OpenAI without generating unused channels',async()=>{
 const original=globalThis.fetch,oldA=process.env.ANTHROPIC_API_KEY,oldO=process.env.OPENAI_API_KEY;process.env.ANTHROPIC_API_KEY='test';process.env.OPENAI_API_KEY='test';
 try{for(const provider of ['anthropic','openai']){
  globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options.body),schema=provider==='anthropic'?body.tools[0].input_schema:body.text.format.schema;assert.deepEqual(schema.required,['threads','review']);assert.equal(schema.additionalProperties,false);const out={threads:'Một ý ngắn.',review:'Kiểm tra nguồn.'};return Response.json(provider==='anthropic'?{stop_reason:'tool_use',content:[{type:'tool_use',input:out}],usage:{input_tokens:10,output_tokens:20}}:{status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(out)}]}],usage:{total_tokens:30}});};
  const result=await generateCopy('i','p',{provider},{channels:['threads']});assert.equal(result.output.threads,'Một ý ngắn.');assert.equal(result.output.facebook,'');assert.equal(result.tokens,30);
 }}finally{globalThis.fetch=original;if(oldA===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=oldA;if(oldO===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldO;}
});

test('missing post-format migration is detected before a paid generation or run lock',async()=>{
 let source=await readFile(new URL('../lib/content-generate.ts',import.meta.url),'utf8');for(const name of ['post-images','ai-provider','content-rules','reel-rules','operation-error'])source=source.replaceAll(`@/lib/${name}`,new URL(`../lib/${name}.ts`,import.meta.url).href);
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {generateContent}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 let locks=0;
 const db={from(table){const chain=new Proxy({},{get(_,key){if(key==='then')return resolve=>Promise.resolve({data:table==='affiliate_products'?{id:'p',name:'Nước giặt',description:'Nguồn',variant:'',affiliate_url:'https://example.com/a'}:null,error:table==='affiliate_content_posts'?{code:'42703'}:null}).then(resolve);return()=>{if(table==='affiliate_content_runs')locks++;return chain;};}});return chain;}};
 await assert.rejects(generateContent(db,'owner',{productId:'p',channels:['facebook'],length:'tiny'}),e=>e.kind==='database'&&e.message.includes('reels.sql'));assert.equal(locks,0);
});
