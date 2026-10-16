import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {postFormat,VIDEO_BUCKET,videoMetadata} from '../lib/reel-rules.ts';
import {postImages} from '../lib/post-images.ts';
import {hasDisclosure,validatePost,isChannel,composePost} from '../lib/content-rules.ts';

async function fixture({missingVideo=false,uncertain=false}={}){
 const state={status:'draft',calls:0,signed:0,claims:0};
 const productId='11111111-1111-4111-8111-111111111111',videoId='22222222-2222-4222-8222-222222222222';
 const body=composePost('Áo giặt xong vẫn lo mùi?','https://example.com/affiliate');
 const post={id:'post',product_id:productId,channel:'instagram',body,post_format:'reel',video_id:videoId,status:'draft'};
 const db={storage:{from(bucket){assert.equal(bucket,VIDEO_BUCKET);return {async createSignedUrl(path,expires){state.signed++;assert.equal(path,'owner/product/approved.mp4');assert.equal(expires,3600);return {data:{signedUrl:'https://storage.example.com/signed-approved-video.mp4'},error:null};}};}},rpc:async()=>({data:true,error:null}),from(table){let action='select',payload;const filters={};const chain=new Proxy({},{get(_,key){if(key==='then')return resolve=>{
  let data=null;
  if(table==='affiliate_content_posts'){
   if(action==='select')data={...post,status:state.status};
   else {if(payload.status==='publishing'){assert.equal(filters.status,'draft');state.claims++;}state.status=payload.status||state.status;data={...post,...payload,status:state.status};}
  }
  if(table==='affiliate_products')data={affiliate_url:'https://example.com/affiliate'};
  if(table==='affiliate_product_videos'){
   assert.equal(filters.id,videoId);assert.equal(filters.product_id,productId);assert.equal(filters.owner_id,'owner');assert.equal(filters.approved,true);
   data=missingVideo?null:{storage_path:'owner/product/approved.mp4',size_bytes:1024,duration:20,width:1080,height:1920};
  }
  return Promise.resolve({data,error:null}).then(resolve);
 };return(...args)=>{if(key==='update'){action='update';payload=args[0];}if(key==='eq')filters[args[0]]=args[1];return chain;};}});return chain;}};
 globalThis.__reelPipeline={postFormat,VIDEO_BUCKET,videoMetadata,postImages,hasDisclosure,validatePost,isChannel,signImage:()=>assert.fail(),env:()=>assert.fail(),assertPublishingQuota:async()=>{},instagramTarget:async()=>({id:'123',token:'private',version:'v26.0'}),socialTarget:async()=>assert.fail(),publishSocial:async()=>assert.fail('must not publish a Reel as a photo'),publishReel:async input=>{state.calls++;assert.equal(input.videoUrl,'https://storage.example.com/signed-approved-video.mp4');assert.equal(input.body,body);await input.onContainer('container');if(uncertain)throw new Error('Meta result uncertain');return {id:'published-reel'};}};
 let source=await readFile(new URL('../lib/content-publish.ts',import.meta.url),'utf8');source=source.replace(/^import .*\n/gm,'');
 source='const {postFormat,VIDEO_BUCKET,videoMetadata,postImages,hasDisclosure,validatePost,isChannel,signImage,env,assertPublishingQuota,instagramTarget,socialTarget,publishSocial,publishReel}=globalThis.__reelPipeline;\n'+source+'\n//'+Math.random();
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {publishContent}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const send=()=>publishContent(db,'owner',{postId:'post',body,action:'publish',approved:true,expectedTargetId:'123',postFormat:'feed',videoId:'attacker',videoUrl:'https://attacker.example.com/',imageIds:['foreign-image']});
 return {send,state};
}
test('publishing takes canonical Reel/video from the owned draft, ignoring untrusted client overrides',async()=>{
 const {send,state}=await fixture();assert.equal((await send()).post.external_id,'published-reel');assert.equal(state.status,'published');assert.equal(state.calls,1);assert.equal(state.claims,1);
 await assert.rejects(send());assert.equal(state.calls,1,'same draft is never submitted again');
});
test('missing/unapproved/foreign video stops before claiming or sending; uncertainty locks out a second send',async()=>{
 const missing=await fixture({missingVideo:true});await assert.rejects(missing.send());assert.equal(missing.state.signed,0);assert.equal(missing.state.claims,0);assert.equal(missing.state.calls,0);
 const unknown=await fixture({uncertain:true});await assert.rejects(unknown.send());assert.equal(unknown.state.status,'unknown');await assert.rejects(unknown.send());assert.equal(unknown.state.calls,1);
});
