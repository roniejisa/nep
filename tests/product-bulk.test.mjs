import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createClient} from '@supabase/supabase-js';
import {sourceDescription,isPublishReady,readyIssues,validAffiliate} from '../lib/product-readiness.ts';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const rules=await readFile(new URL('../lib/product-readiness.ts',import.meta.url),'utf8'),bulk=await readFile(new URL('../lib/product-bulk.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(rules+'\n'+bulk.replace(/^import[^\n]+\n/gm,''),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {bulkInput,applyProductBulk}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const product=(n,changes={})=>({id:id(n),owner_id:owner,name:'Nước giặt túi 2 lít',shop_name:'Shop nguồn',variant:'Túi',description:'',affiliate_url:'https://s.shopee.vn/original',status:'draft',verified_at:null,category:'Khác',updated_at:'2026-10-17T10:00:00+00:00',...changes});
function fixture(rows,{beforePatch=()=>{},failIds=[]}={}){
 const records=structuredClone(rows),writes=[],requests=[];
 const db=createClient('https://bulk-test.invalid','test-service-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url),method=options.method||'GET';requests.push({method,url});
  assert.equal(url.searchParams.get('owner_id'),'eq.'+owner,'every read/write must scope the authenticated owner');
  if(method==='GET'){
   const ids=url.searchParams.get('id').replace(/^in\.\(|\)$/g,'').split(',');return Response.json(records.filter(p=>p.owner_id===owner&&ids.includes(p.id)));
  }
  assert.equal(method,'PATCH');const target=url.searchParams.get('id').slice(3),payload=JSON.parse(options.body);writes.push({target,payload});beforePatch(records,target);
  if(failIds.includes(target))return Response.json({code:'500',message:'database unavailable'},{status:500});
  const found=records.find(p=>p.id===target&&p.owner_id===owner&&'eq.'+p.updated_at===url.searchParams.get('updated_at'));
  if(!found)return Response.json([]);Object.assign(found,payload,{updated_at:'2026-10-17T11:00:00+00:00'});return Response.json([{id:found.id}]);
 }}});
 return {db,records,writes,requests};
}
test('ready requires real source facts and HTTPS; no image is needed for a text post',()=>{
 const p=product(1);assert.ok(readyIssues(p).length);assert.deepEqual(readyIssues(p,true),[]);
 const description=sourceDescription(p);assert.ok(description.includes(p.name));assert.ok(description.includes(p.shop_name));assert.ok(!description.includes('hoa hồng'));assert.ok(!description.includes('hiệu quả'));
 assert.equal(isPublishReady({...p,status:'ready',verified_at:'2026-10-17',description}),true);
 assert.equal(isPublishReady({...p,status:'ready',description}),false);
 assert.equal(sourceDescription({...p,name:'SP01 — cần bổ sung thông tin'}),'');
 for(const link of ['http://shop.test','https://user:pass@shop.test',' https://shop.test','javascript:alert(1)'])assert.equal(validAffiliate(link),false);
});
test('bulk validation requires explicit confirmation, exact IDs and bounded input',()=>{
 assert.throws(()=>bulkInput({action:'ready',ids:[id(1)]}),/Xác nhận/);
 assert.throws(()=>bulkInput({action:'delete',ids:[id(1)]}));
 assert.throws(()=>bulkInput({action:'draft',ids:['not-a-uuid']}));
 assert.throws(()=>bulkInput({action:'draft',ids:Array(1001).fill(id(1))}));
 assert.throws(()=>bulkInput({action:'category',ids:[id(1)],category:' '}));
 assert.deepEqual(bulkInput({action:'ready',ids:[id(1),id(1)],confirmed:true,fillFromFacts:true}).ids,[id(1)]);
});
test('bulk approval handles a full CSV batch, preserves all original fields and is idempotent',async()=>{
 const rows=Array.from({length:199},(_,n)=>product(n+1,{description:n===0?'Mô tả do người dùng sửa':'',notes:'Giữ ghi chú',import_metadata:{columns:{'Giá':'98,6k','Cột bổ sung':'Nguyên bản'}}})),f=fixture(rows);
 const input=bulkInput({action:'ready',ids:rows.map(p=>p.id),confirmed:true,fillFromFacts:true});
 const result=await applyProductBulk(f.db,owner,input);assert.equal(result.updated,199);assert.equal(result.blocked,0);assert.equal(f.records[0].description,'Mô tả do người dùng sửa');
 for(let i=0;i<f.records.length;i++){assert.ok(isPublishReady(f.records[i]));assert.equal(f.records[i].affiliate_url,rows[i].affiliate_url);assert.deepEqual(f.records[i].import_metadata,rows[i].import_metadata);assert.equal(f.records[i].notes,'Giữ ghi chú');}
 const again=await applyProductBulk(f.db,owner,input);assert.equal(again.updated,0);assert.equal(again.unchanged,199);assert.equal(f.writes.length,199);
});
test('blocked products, foreign owners and concurrent edits do not turn into ready products',async()=>{
 let raced=false;const f=fixture([product(1),product(2,{affiliate_url:'http://unsafe.test'}),product(3,{owner_id:other}),product(4)],{beforePatch:(rows,target)=>{if(target===id(4)&&!raced){raced=true;Object.assign(rows.find(p=>p.id===target),{description:'Vừa sửa ở tab khác',updated_at:'2026-10-17T12:00:00+00:00'});}}});
 const result=await applyProductBulk(f.db,owner,bulkInput({action:'ready',ids:[1,2,3,4].map(id),confirmed:true,fillFromFacts:true}));
 assert.equal(result.updated,1);assert.equal(result.blocked,2);assert.equal(result.failed,1);assert.equal(result.results[3].state,'conflict');
 assert.equal(f.records[2].status,'draft');assert.equal(f.records[3].description,'Vừa sửa ở tab khác');assert.equal(f.records[3].status,'draft');
});
test('missing descriptions can be left for review, and partial failures do not report success',async()=>{
 const f=fixture([product(1),product(2,{description:'Nguồn đã nhập'}),product(3,{description:'Nguồn khác'})],{failIds:[id(3)]});
 const result=await applyProductBulk(f.db,owner,bulkInput({action:'ready',ids:[1,2,3].map(id),confirmed:true,fillFromFacts:false}));
 assert.equal(result.blocked,1);assert.equal(result.updated,1);assert.equal(result.failed,1);assert.equal(f.records[0].description,'');assert.equal(f.records[2].status,'draft');
 const deferred=await applyProductBulk(f.db,owner,bulkInput({action:'draft',ids:[id(2)]}),Date.now()-1);assert.equal(deferred.results[0].state,'deferred');assert.equal(f.records[1].status,'ready');
});
test('category and pause actions preserve content and do not publish or delete anything',async()=>{
 const f=fixture([product(1,{description:'Nguồn đầy đủ',verified_at:'2026-10-17',status:'ready'})]);
 await applyProductBulk(f.db,owner,bulkInput({action:'category',ids:[id(1)],category:'Đồ hằng ngày'}));assert.equal(f.records[0].category,'Đồ hằng ngày');assert.equal(f.records[0].status,'ready');
 await applyProductBulk(f.db,owner,bulkInput({action:'draft',ids:[id(1)]}));assert.equal(f.records[0].status,'draft');assert.ok(f.records[0].verified_at);
 await applyProductBulk(f.db,owner,bulkInput({action:'archived',ids:[id(1)]}));assert.equal(f.records[0].status,'archived');assert.equal(f.records[0].description,'Nguồn đầy đủ');assert.equal(f.records.length,1);
 assert.ok(f.requests.every(r=>r.url.pathname==='/rest/v1/affiliate_products'));
});
