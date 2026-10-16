import assert from 'node:assert/strict';
import {test} from 'node:test';
import {generateCopy} from '../lib/ai-provider.ts';
import {assertPublishingQuota} from '../lib/publishing-quota.ts';

const output={facebook:'Giặt xong vẫn lo mùi áo?\nXem mô tả trước khi chọn.',threads:'Áo sạch mà vẫn lo mùi?\nXem thông tin sản phẩm.',instagram:'Giặt xong vẫn lo mùi áo?\nXem mô tả trước khi chọn.',review:'Kiểm tra thông tin nguồn.'};
const success=(copy=output)=>Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(copy)}]}}],usageMetadata:{totalTokenCount:80}});

test('AI retries only the selected Gemini model, waits 10s and stops at first success',async()=>{
 const original=globalThis.fetch,key=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-key';
 let calls=0;const delays=[],events=[];
 try{
  globalThis.fetch=async(url,options)=>{
   calls++;assert.ok(url.includes('/gemini-3.5-flash-lite:generateContent'));assert.ok(!url.includes('test-key'));assert.equal(options.headers['x-goog-api-key'],'test-key');
   if(calls===1)return Response.json({error:'provider body must stay private'},{status:429});
   if(calls===2)return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'not-json'}]}}]});
   return success();
  };
  const result=await generateCopy('instructions','input',{provider:'gemini',model:'gemini-3.5-flash-lite'},{maxAttempts:5,delayMs:10000,requestTimeoutMs:30000,pause:async ms=>delays.push(ms),onFailure:async(e,n,retry)=>events.push({n,retry,message:e.message})});
  assert.equal(calls,3);assert.equal(result.attempts,3);assert.equal(result.model,'gemini-3.5-flash-lite');assert.equal(result.tokens,null);
  assert.deepEqual(delays,[10000,10000]);assert.deepEqual(events.map(e=>[e.n,e.retry]),[[1,true],[2,true]]);
  assert.ok(!JSON.stringify(events).includes('provider body'));
 }finally{globalThis.fetch=original;if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;}
});

test('persistent AI errors make at most five calls and four delays without leaking provider bodies',async()=>{
 const original=globalThis.fetch,key=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-key';let calls=0;const delays=[],events=[];
 try{
  globalThis.fetch=async()=>{calls++;return Response.json({error:'secret-response-body'},{status:401});};
  await assert.rejects(generateCopy('i','p',{provider:'gemini'},{maxAttempts:5,pause:async ms=>delays.push(ms),onFailure:async(e,n,retry)=>events.push({n,retry,message:e.message})}),e=>e.message.includes('5/5')&&e.message.includes('HTTP 401')&&!e.message.includes('secret-response-body'));
  assert.equal(calls,5);assert.deepEqual(delays,[10000,10000,10000,10000]);assert.equal(events.at(-1).retry,false);
 }finally{globalThis.fetch=original;if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;}
});

test('invalid generated copy is retried before saving; manual calls still default to one attempt',async()=>{
 const original=globalThis.fetch,key=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-key';let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;return success(calls===1?{...output,facebook:'x'.repeat(300)}:output);};
  const result=await generateCopy('i','p',{provider:'gemini'},{maxAttempts:5,pause:async()=>{},validate:copy=>{if(copy.facebook.length>150)throw new Error('Nội dung quá dài.');}});
  assert.equal(result.attempts,2);assert.equal(calls,2);assert.equal(result.output.facebook,output.facebook);
  calls=0;globalThis.fetch=async()=>{calls++;throw new DOMException('timeout','TimeoutError');};
  await assert.rejects(generateCopy('i','p',{provider:'gemini'}));assert.equal(calls,1);
  calls=0;await assert.rejects(generateCopy('i','p',{provider:'gemini'},{maxAttempts:5,deadline:Date.now()+5000,pause:async()=>assert.fail('Not enough time to wait')}));assert.equal(calls,1);
 }finally{globalThis.fetch=original;if(key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=key;}
});

test('publishing reads actual account quotas and enforces no invented Facebook daily ceiling',async()=>{
 const original=globalThis.fetch;let calls=0,total=251,used=250;
 try{
  globalThis.fetch=async(url,options)=>{calls++;assert.ok(url.includes('publishing_limit?'));assert.equal(options.headers.Authorization,'Bearer private-token');assert.ok(!url.includes('private-token'));return Response.json({data:[{quota_usage:used,config:{quota_total:total}}]});};
  const target={id:'123',token:'private-token',version:'v25.0'};
  await assertPublishingQuota('threads',target);await assertPublishingQuota('instagram',{...target,instagramLogin:'instagram'});assert.equal(calls,2);
  total=used;await assert.rejects(assertPublishingQuota('threads',target),e=>e.kind==='rate_limit'&&e.message.includes('250/250'));
  await assertPublishingQuota('facebook',target);assert.equal(calls,3);
  globalThis.fetch=async()=>Response.json({data:[{}]});await assert.rejects(assertPublishingQuota('instagram',target),e=>e.kind==='meta');
 }finally{globalThis.fetch=original;}
});
