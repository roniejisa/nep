import assert from 'node:assert/strict';
import {test} from 'node:test';
import sharp from 'sharp';
import {generateProductImage} from '../lib/gemini-image.ts';
import {MODEL_SUGGESTIONS,generateCopy} from '../lib/ai-provider.ts';
test('all five requested text models are available; image model cannot enter the copy adapter',async()=>{
 for(const model of ['gemini-3.1-flash-lite','gemini-3.5-flash-lite','gemini-3.8-flash','gemini-3.6-flash','gemini-3.1-pro-preview'])assert.ok(MODEL_SUGGESTIONS.gemini.includes(model));
 const previous=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-key';try{await assert.rejects(generateCopy('write','input',{provider:'gemini',model:'gemini-3.1-flash-lite-image'}),/Model ảnh/);}finally{if(previous===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previous;}
});
test('image API sends one owned reference and returns compact WebP instead of PNG',async()=>{
 const reference=await sharp({create:{width:200,height:200,channels:3,background:'#abc'}}).webp().toBuffer();
 const generated=await sharp({create:{width:1024,height:1024,channels:3,background:'#cde'}}).png().toBuffer();let calls=0;
 const result=await generateProductImage({key:'private-key',reference,prompt:'new background',transport:async(url,options)=>{
  calls++;assert.ok(url.endsWith('/gemini-3.1-flash-lite-image:generateContent'));assert.ok(!url.includes('private-key'));assert.equal(options.headers['x-goog-api-key'],'private-key');
  const body=JSON.parse(options.body);assert.equal(body.contents[0].parts[1].inlineData.mimeType,'image/webp');assert.equal(body.generationConfig.imageConfig.imageSize,'1K');assert.deepEqual(body.generationConfig.responseModalities,['TEXT','IMAGE']);
  return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,inlineData:{mimeType:'image/png',data:'ignore'}},{inlineData:{mimeType:'image/png',data:generated.toString('base64')}}]}}],usageMetadata:{totalTokenCount:300}});
 }});
 assert.equal(calls,1);assert.equal(result.tokens,300);const metadata=await sharp(result.data).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.width,1024);assert.ok(result.data.length<=2097152);
});
test('image quota error is redacted and never retried; invalid reference makes no API call',async()=>{
 const reference=await sharp({create:{width:10,height:10,channels:3,background:'#fff'}}).webp().toBuffer();let calls=0;
 await assert.rejects(generateProductImage({key:'key',reference,prompt:'image',transport:async()=>{calls++;return Response.json({error:'private-key'},{status:429});}}),e=>e.message.includes('429')&&!e.message.includes('private-key'));assert.equal(calls,1);
 await assert.rejects(generateProductImage({key:'key',reference:Buffer.from('not webp'),prompt:'image',transport:async()=>{calls++;return Response.json({});}}));assert.equal(calls,1);
});
