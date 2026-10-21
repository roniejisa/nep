import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {composePost,affiliateComment,DISCLOSURE,PRODUCT_LINK_CTA,FACEBOOK_CTA,INSTAGRAM_CTA,validatePost,isChannel} from '../lib/content-rules.ts';
import {publishAffiliateComment} from '../lib/facebook-comment.ts';
import {publishSocial} from '../lib/social-publish.ts';
import {postImages} from '../lib/post-images.ts';
import {postFormat,VIDEO_BUCKET,videoMetadata} from '../lib/reel-rules.ts';
const link='https://s.shopee.vn/4LK8gjOA0T',target={id:'123',token:'private-test-token',version:'v26.0',appSecretProof:'proof'};

test('new and legacy drafts have per-channel placement, exact CTA, no old commission footers or leaked URLs',()=>{
 const old=`Áo giặt xong vẫn lo mùi?\nChọn theo chất liệu.\n\nLink affiliate: mình có thể nhận hoa hồng khi bạn mua qua link.\n${link}`;
 for(const channel of ['facebook','instagram','threads']){
  const body=composePost(old,link,channel);
  assert.equal(composePost(body,link,channel),body,'normalization is idempotent');
  assert.ok(!body.includes(DISCLOSURE));assert.doesNotMatch(body,/nhận hoa hồng|Link affiliate/);
  if(channel==='threads')assert.ok(body.endsWith(link));
  else {assert.ok(!body.includes('https:'));assert.ok(body.endsWith(channel==='facebook'?FACEBOOK_CTA:INSTAGRAM_CTA));}
  validatePost(channel,body);
 }
 const ai='Một ý có căn cứ. https://other.example/path www.shop.com/path shop.vn/p [Mua](https://x.com) <a href="https://y.com">Xem</a>';
 for(const channel of ['facebook','instagram'])assert.doesNotMatch(composePost(ai,link,channel),/https?:|www\.|shop\.vn|other\.example/);
 assert.ok(composePost('Sữa rửa mặt hương hoa hồng.',link,'facebook').includes('hương hoa hồng'));
 assert.equal(affiliateComment(link),`${PRODUCT_LINK_CTA}\n${link}`);
 assert.throws(()=>composePost('Copy',link,undefined));
});

function commentDB({status='pending',failSave=false,claimError=false,channel='facebook',owner='owner'}={}){
 const row={id:'draft',owner_id:owner,channel,status:'published',target_id:'123',external_id:'123_456',affiliate_comment_text:affiliateComment(link),affiliate_comment_status:status};
 const logs=[];
 const db={from(table){let payload,action='select';const filters={};
  const chain=new Proxy({},{get(_,key){if(key==='then')return resolve=>{
   let data=null,error=null;
   if(table==='affiliate_automation_errors'){logs.push(payload);return Promise.resolve({data:null,error:null}).then(resolve);}
   if(claimError&&payload?.affiliate_comment_status==='sending')error={code:'offline'};
   else if(failSave&&payload?.affiliate_comment_status==='sent')error={code:'offline'};
   else if(Object.entries(filters).every(([k,v])=>row[k]===v)){
    if(action==='update')Object.assign(row,payload);data={...row};
   }
   return Promise.resolve({data,error}).then(resolve);
  };return(...args)=>{if(key==='update'||key==='insert'){action=key;payload=args[0];}if(key==='eq')filters[args[0]]=args[1];return chain;};}});return chain;
 }};return {db,row,logs};
}
test('Facebook comment claims once across concurrent workers, uses saved link and correct Page target/proof',async()=>{
 const f=commentDB();let calls=0;
 const transport=async(url,init)=>{calls++;assert.equal(url,'https://graph.facebook.com/v26.0/123_456/comments');assert.equal(init.headers.Authorization,'Bearer private-test-token');assert.equal(init.body.get('message'),affiliateComment(link));assert.equal(init.body.get('appsecret_proof'),'proof');return Response.json({id:'456_789'});};
 await Promise.all([1,2].map(()=>publishAffiliateComment(f.db,'owner','draft',target,Date.now()+20000,transport)));
 assert.equal(calls,1);assert.equal(f.row.status,'published');assert.equal(f.row.affiliate_comment_status,'sent');assert.equal(f.row.affiliate_comment_id,'456_789');
 await publishAffiliateComment(f.db,'owner','draft',target,Date.now()+20000,transport);assert.equal(calls,1);
});
test('comment errors preserve published state, distinguish unknown from rejected, and never resend',async()=>{
 for(const [kind,expected] of [['timeout','unknown'],['rejected','failed'],['json','unknown'],['missing_id','unknown'],['save','unknown']]){
  const f=commentDB({failSave:kind==='save'});let calls=0;
  const transport=async()=>{calls++;if(kind==='timeout')throw new Error('secret token must not leak');if(kind==='rejected')return Response.json({error:{code:200}},{status:403});if(kind==='json')return new Response('bad json');if(kind==='missing_id')return Response.json({success:true});return Response.json({id:'456_789'});};
  const result=await publishAffiliateComment(f.db,'owner','draft',target,Date.now()+20000,transport);
  assert.equal(f.row.status,'published');assert.equal(f.row.affiliate_comment_status,expected);assert.match(result.warning,/Bài đã đăng/);assert.equal(f.logs.length,1);assert.doesNotMatch(JSON.stringify(f.logs),/private-test-token|secret token/);
  await publishAffiliateComment(f.db,'owner','draft',target,Date.now()+20000,transport);assert.equal(calls,1);
 }
});
test('expired budget, wrong owner/target/channel and missing claim stop before sending',async()=>{
 for(const options of [{deadline:0},{owner:'other'},{target:{...target,id:'999'}},{channel:'threads'},{claimError:true}]){
  const f=commentDB(options);let calls=0;
  await publishAffiliateComment(f.db,'owner','draft',options.target||target,options.deadline??Date.now()+20000,async()=>{calls++;assert.fail();});assert.equal(calls,0);assert.equal(f.row.status,'published');
 }
});
test('Facebook photo publishing returns Page post ID for the subsequent comment',async()=>{
 const result=await publishSocial({channel:'facebook',body:'Caption without URL',imageUrls:['https://media.example/a.jpg'],target,onContainer:async()=>{},transport:async()=>Response.json({id:'photo123',post_id:'123_456'})});
 assert.equal(result.id,'123_456');
});

test('publish pipeline normalizes old drafts for feed and Reel, saves published ID before commenting, and never comments on IG/Threads',async()=>{
 for(const channel of ['facebook','instagram','threads'])for(const format of channel==='threads'?['feed']:['feed','reel']){
  const row={id:'draft',owner_id:'owner',product_id:'product',channel,post_format:format,video_id:'video',body:`Hook\n${DISCLOSURE}\n${link}`,status:'draft',affiliate_comment_status:'none'};
  let sent=0,commented=0;
  const db={rpc:async()=>({data:true}),storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://media.example/video.mp4'}})})},from(table){let action='select',payload;const filters={};const chain=new Proxy({},{get(_,key){if(key==='then')return resolve=>{
   let data=null;if(table==='affiliate_products')data={affiliate_url:link};
   if(table==='affiliate_product_images')data=[{id:'11111111-1111-4111-8111-111111111111'}];
   if(table==='affiliate_product_videos')data={storage_path:'path',size_bytes:1000,duration:15,width:1080,height:1920};
   if(table==='affiliate_content_posts'&&Object.entries(filters).every(([k,v])=>row[k]===v)){if(action==='update')Object.assign(row,payload);data={...row};}
   return Promise.resolve({data,error:null}).then(resolve);
  };return(...args)=>{if(key==='update'){action='update';payload=args[0];}if(key==='eq')filters[args[0]]=args[1];return chain;};}});return chain;}};
  const publish=async input=>{sent++;assert.equal(row.status,'publishing');assert.equal(input.body,composePost(row.body,link,channel));if(channel!=='threads')assert.doesNotMatch(input.body,/https:/);return {id:'123_456'};};
  globalThis.__placementPipeline={composePost,affiliateComment,validatePost,isChannel,postImages,postFormat,VIDEO_BUCKET,videoMetadata,env:()=> 'https://site.example',signImage:()=> 'signed',assertPublishingQuota:async()=>{},socialTarget:async()=>target,instagramTarget:async()=>target,publishSocial:publish,publishReel:publish,publishAffiliateComment:async()=>{commented++;assert.equal(row.status,'published');assert.equal(row.external_id,'123_456');assert.equal(row.affiliate_comment_text,affiliateComment(link));return {warning:'Bình luận cần kiểm tra'};}};
  let source=await readFile(new URL('../lib/content-publish.ts',import.meta.url),'utf8');source=source.replace(/^import .*\n/gm,'');source='const {'+Object.keys(globalThis.__placementPipeline).join(',')+'}=globalThis.__placementPipeline;\n'+source+'\n//'+Math.random();
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const {publishContent}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
  const input={postId:'draft',body:row.body,approved:true,action:'publish',imageIds:channel==='instagram'&&format==='feed'?['11111111-1111-4111-8111-111111111111']:[]};
  const result=await publishContent(db,'owner',input);assert.equal(result.post.status,'published');assert.equal(commented,channel==='facebook'?1:0);
  await assert.rejects(publishContent(db,'owner',input));assert.equal(sent,1);
 }
});
