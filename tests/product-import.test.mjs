import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import sharp from 'sharp';
import {analyzeImport,csvRows,vnNumber,shopeeIdentity,imageSourceURL,productIdFromFilename} from '../lib/product-import.ts';
import {pageImageURLs,limitedDownload} from '../lib/product-image-fetch.ts';
import {importedWebP,storeImportedImage,runProductImages} from '../lib/product-image-worker.ts';
const header='Mã sản phẩm,Tên sản phẩm,Giá,Doanh thu,Tên cửa hàng,Tỉ lệ hoa hồng,Hoa hồng,Link sản phẩm,Link ưu đãi';
const row=(id='12345678901',price='98,6k',shop='111',name='Sản phẩm nguồn')=>`${id},"${name}","${price}",72,Shop,"12,5%",₫1.000,https://shopee.vn/product/${shop}/${id},https://s.shopee.vn/${id}`;
const files=[{name:'one.csv',text:'\uFEFF'+header+'\r\n'+row()+'\r\n'+row('12345678902','1,4tr')},{name:'two.csv',text:header+'\n'+row()+'\n'+row('12345678903','259,0k')}];
test('CSV handles BOM, Vietnamese shorthand, quoted commas/newlines and duplicates across files',()=>{
 const report=analyzeImport(files);assert.equal(report.total,4);assert.equal(report.unique,3);assert.equal(report.lines.filter(l=>l.state==='duplicate').length,1);assert.equal(report.items[0].price,98600);assert.equal(report.items[1].price,1400000);assert.equal(report.items[0].commission_rate,12.5);assert.equal(report.items[0].external_product_id,'12345678901');assert.equal(report.items[0].description,'');assert.equal(report.items[0].metadata.doanh_thu_raw,'72');
 assert.deepEqual(csvRows('a,b\r\n"line\nnext","a ""quote"""\r\n'),[['a','b'],['line\nnext','a "quote"']]);
 assert.equal(vnNumber('₫1.250.000'),1250000);assert.equal(vnNumber('0% ',true),0);assert.equal(vnNumber('12,4tr'),12400000);assert.equal(vnNumber(''),null);assert.throws(()=>vnNumber('101%',true));assert.throws(()=>csvRows('a,b\n"never closed'));
 assert.equal(productIdFromFilename('12345678901_2.webp'),'12345678901');assert.equal(productIdFromFilename('photo12345.jpg'),null);
});
test('invalid rows do not poison valid ones; IDs must agree, URL credentials and image SSRF are rejected',()=>{
 const report=analyzeImport([{name:'test.csv',text:header+'\n'+row().replace('/111/12345678901','/111/999')+'\n'+row('12345678902')}]);assert.equal(report.unique,1);assert.equal(report.lines[0].state,'invalid');
 assert.equal(shopeeIdentity('https://shopee.vn/name-i.111.12345678901?x=1').itemId,'12345678901');
 for(const url of ['http://shopee.vn/product/111/123','https://shopee.vn.evil.test/product/111/123','https://user:pass@shopee.vn/product/111/123','https://127.0.0.1/a','https://down-vn.img.susercontent.com:444/a'])assert.throws(()=>imageSourceURL(url));
 assert.throws(()=>analyzeImport([{name:'bad.csv',text:'Mã sản phẩm,Tên sản phẩm\n1,X'}]));
 const thousand={name:'1000.csv',text:header+'\n'+Array.from({length:1000},(_,i)=>row(String(10000000000+i))).join('\n')+'\n'};assert.equal(analyzeImport([thousand]).unique,1000);
});
test('public-page extraction gets product images without taking recommended-item images',()=>{
 const source='https://shopee.vn/product/111/12345678901',image='https://down-vn.img.susercontent.com/file/abc';
 const html=`<meta content="${source}" property="og:url"><meta content="${image}?a=1&amp;b=2" property="og:image"><script type="application/ld+json">{"@graph":[{"@type":"Product","url":"${source}","image":["${image}2"]},{"@type":"Product","url":"https://shopee.vn/product/111/999","image":"${image}wrong"}]}</script>`;
 assert.deepEqual(pageImageURLs(html,source),[image+'?a=1&b=2',image+'2']);assert.deepEqual(pageImageURLs('<html>login/captcha</html>',source),[]);assert.deepEqual(pageImageURLs(`<meta property="og:image" content="${image}">`,source),[]);
 assert.throws(()=>pageImageURLs('<meta property="og:url" content="https://shopee.vn/product/111/999">',source));
});
test('bounded downloads refuse unsafe redirects, excessive bytes and unexpected content before decoding',async()=>{
 const source='https://down-vn.img.susercontent.com/file/abc';let calls=0;
 await assert.rejects(limitedDownload(source,'image',Date.now()+5000,async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://127.0.0.1/internal'}});}));assert.equal(calls,1);
 await assert.rejects(limitedDownload(source,'image',Date.now()+5000,async()=>new Response('text',{headers:{'content-type':'text/html'}})));
 await assert.rejects(limitedDownload(source,'image',Date.now()+5000,async()=>new Response('x',{headers:{'content-type':'image/jpeg','content-length':'20000000'}})));
 await assert.rejects(limitedDownload(source,'image',Date.now()+5000,async()=>new Response(null,{status:403})),/HTTP 403/);
});
test('imported photos are real WebP under the storage limit and never enlarge the original',async()=>{
 const png=await sharp({create:{width:1800,height:900,channels:3,background:'#446644'}}).png().toBuffer(),image=await importedWebP(png);
 assert.equal(image.width,1600);assert.equal(image.height,800);assert.ok(image.data.length<=2097152);assert.equal((await sharp(image.data).metadata()).format,'webp');
 const small=await importedWebP(await sharp({create:{width:200,height:100,channels:3,background:'white'}}).png().toBuffer());assert.equal(small.width,200);
 await assert.rejects(importedWebP(Buffer.from('<svg/>')));
});
async function sqlFixture(){
 const db=new PGlite(),a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${a}'),('${b}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid,bucket_id text,name text);create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;create function storage.extension(text) returns text language sql immutable as $$select split_part($1,'.',2)$$;grant usage on schema public,auth,storage to anon,authenticated,service_role;`);
 await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 await db.exec(`alter table affiliate_products drop constraint affiliate_products_category_check;create table affiliate_categories(owner_id uuid,name text,primary key(owner_id,name));grant all on all tables in schema public to service_role;`);
 const sql=await readFile(new URL('../supabase/product-import.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 return {db,a,b,sql,importItem:async(item,owner=a)=> (await db.query('select import_affiliate_product($1,$2::jsonb,$3,1,true) result',[owner,JSON.stringify(item),'Đồ hằng ngày'])).rows[0].result};
}
test('SQL imports once per owner/product ID, preserves edits, queues only missing photos and denies browser job writes',async()=>{
 const f=await sqlFixture();try{
  const item=analyzeImport(files).items[0];const first=await f.importItem(item);assert.equal(first.state,'inserted');
  await f.db.query("update affiliate_products set description='User edited',status='ready',verified_at=now() where id=$1",[first.id]);
  assert.equal((await f.importItem({...item,affiliate_url:'https://s.shopee.vn/different-link',description:'CSV changed'})).state,'existing');
  assert.equal((await f.db.query('select count(*)::int n from affiliate_products')).rows[0].n,1);const product=(await f.db.query('select * from affiliate_products')).rows[0];assert.equal(product.description,'User edited');assert.equal(product.affiliate_url,item.affiliate_url);assert.equal(product.status,'ready');
  assert.equal((await f.importItem({...item,external_shop_id:'999'})).state,'conflict');
  await assert.rejects(f.db.query("insert into affiliate_products(owner_id,name,affiliate_url,source_url) values($1,'manual duplicate','https://s.shopee.vn/manual', $2)",[f.a,item.source_url]),e=>e.code==='23505');
  const other=await f.importItem(item,f.b);assert.equal(other.state,'inserted');
  await f.db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${f.a}',false);`);assert.equal((await f.db.query('select * from affiliate_product_image_jobs')).rows.length,1);
  await assert.rejects(f.db.query("update affiliate_product_image_jobs set status='pending'"),e=>e.code==='42501');
  await assert.rejects(f.db.query('select * from claim_affiliate_product_image($1)',[f.a]),e=>e.code==='42501');
  await f.db.exec('set role anon');await assert.rejects(f.db.query('select * from affiliate_product_image_jobs'),e=>e.code==='42501');
 }finally{await f.db.close();}
});
test('queue has one active lease per owner, recovers bounded interruptions, and allows explicit image URL enrichment',async()=>{
 const f=await sqlFixture();try{
  const items=analyzeImport(files).items;for(const item of items)await f.importItem(item);
  const claim=async()=> (await f.db.query('select * from claim_affiliate_product_image($1)',[f.a])).rows;
  const first=await claim();assert.equal(first.length,1);assert.equal((await claim()).length,0);
  await f.db.query("update affiliate_product_image_jobs set claimed_at=now()-interval '4 minutes' where product_id=$1",[first[0].product_id]);const recovered=await claim();assert.equal(recovered[0].product_id,first[0].product_id);assert.equal(recovered[0].attempts,2);
  await f.db.query("update affiliate_product_image_jobs set claimed_at=now()-interval '4 minutes' where product_id=$1",[first[0].product_id]);await claim();assert.equal((await f.db.query('select status from affiliate_product_image_jobs where product_id=$1',[first[0].product_id])).rows[0].status,'failed');
  await f.importItem(items[0]);assert.equal((await f.db.query('select status from affiliate_product_image_jobs where product_id=$1',[first[0].product_id])).rows[0].status,'failed','same import does not repeatedly retry blocked pages');
  await f.importItem({...items[0],image_urls:['https://down-vn.img.susercontent.com/file/direct']});assert.equal((await f.db.query('select status from affiliate_product_image_jobs where product_id=$1',[first[0].product_id])).rows[0].status,'pending');
 }finally{await f.db.close();}
});
test('SQL enforces twelve images atomically and cascade deletes media jobs',async()=>{
 const f=await sqlFixture();try{
  const first=await f.importItem(analyzeImport(files).items[0]);
  for(let i=0;i<12;i++)await f.db.query("insert into affiliate_product_images(product_id,owner_id,storage_path,original_name,size_bytes,original_bytes,width,height) values($1,$2,$3,'image.webp',10,10,100,100)",[first.id,f.a,`${f.a}/${first.id}/${i}.webp`]);
  await assert.rejects(f.db.query("insert into affiliate_product_images(product_id,owner_id,storage_path,original_name,size_bytes,original_bytes,width,height) values($1,$2,$3,'image.webp',10,10,100,100)",[first.id,f.a,`${f.a}/${first.id}/extra.webp`]),/12 images/);
  await f.db.query('delete from affiliate_products where id=$1',[first.id]);assert.equal((await f.db.query('select * from affiliate_product_image_jobs')).rows.length,0);
 }finally{await f.db.close();}
});

test('migration backfills legacy URLs without deleting duplicate histories and binds exact short-link matches',async()=>{
 const f=await sqlFixture();try{
  const [item,second]=analyzeImport(files).items;
  await f.db.exec('alter table affiliate_products disable trigger affiliate_product_identity');
  for(const suffix of ['one','two'])await f.db.query("insert into affiliate_products(owner_id,name,affiliate_url,source_url) values($1,$2,$3,$4)",[f.a,'legacy '+suffix,'https://s.shopee.vn/legacy-'+suffix,item.source_url]);
  await f.db.query("insert into affiliate_products(owner_id,name,affiliate_url,description) values($1,'short link legacy',$2,'Keep this description')",[f.a,second.affiliate_url]);
  await f.db.exec('alter table affiliate_products enable trigger affiliate_product_identity');await f.db.exec(f.sql);
  assert.equal((await f.db.query('select count(*)::int n from affiliate_products')).rows[0].n,3);
  assert.equal((await f.db.query('select count(*)::int n from affiliate_products where external_product_id=$1',[item.external_product_id])).rows[0].n,1);
  assert.equal((await f.importItem(item)).state,'conflict');
  const matched=await f.importItem(second);assert.equal(matched.state,'existing');const product=(await f.db.query('select * from affiliate_products where id=$1',[matched.id])).rows[0];assert.equal(product.external_product_id,second.external_product_id);assert.equal(product.name,'short link legacy');assert.equal(product.description,'Keep this description');assert.equal(product.source_url,second.source_url);
 }finally{await f.db.close();}
});

function workerFixture({existing=false,insertResponseLost=false,sourceMismatch=false}={}){
 const owner='owner',product='product',source='https://shopee.vn/product/111/12345678901';
 const state={job:{product_id:product,owner_id:owner,source_url:source,image_urls:[],max_images:1,status:'pending',attempts:0},images:existing?[{id:'manual',source_fingerprint:'manual'}]:[],uploads:[],claims:0};
 const db={rpc:async()=>{state.claims++;if(state.job.status!=='pending')return {data:[]};Object.assign(state.job,{status:'running',claimed_at:'lease-1'});return {data:[{...state.job}]};},storage:{from(){return {upload:async(path)=>{const duplicate=state.uploads.includes(path);state.uploads.push(path);return {error:duplicate?{statusCode:'409'}:null};},remove:()=>assert.fail('Never delete an image on uncertain metadata insertion')};}},from(table){
  let action='select',payload,head=false;const filters={};
  const chain=new Proxy({},{get(_,key){if(key==='then')return resolve=>{
   let data=null,error=null,count=null;
   const matches=row=>Object.entries(filters).every(([k,v])=>row[k]===v);
   if(table==='affiliate_products')data={id:product,external_product_id:sourceMismatch?'999':'12345678901',external_shop_id:'111'};
   if(table==='affiliate_product_images'){
    if(action==='insert'){if(state.images.some(i=>i.id===payload.id))error={code:'23505'};else {state.images.push({...payload});data={...payload};if(insertResponseLost)error={code:'timeout'};}}
    else if(head)count=state.images.length;
    else data=state.images.find(matches)||null;
   }
   if(table==='affiliate_product_image_jobs'&&matches(state.job)){if(action==='update')Object.assign(state.job,payload);data={...state.job};}
   return Promise.resolve({data,error,count}).then(resolve);
  };return(...args)=>{if(key==='select')head=!!args[1]?.head;if(key==='insert'||key==='update'){action=key;payload=args[0];}if(key==='eq')filters[args[0]]=args[1];return chain;};}});return chain;
 }};return {db,state,owner,product};
}
test('worker gets the matching photo, persists WebP once, and a later import does not replace manual photos',async()=>{
 const f=workerFixture(),image=await sharp({create:{width:200,height:200,channels:3,background:'white'}}).png().toBuffer();let calls=0;
 const transport=async url=>{calls++;return String(url).includes('shopee.vn')?new Response('<meta property="og:url" content="https://shopee.vn/product/111/12345678901"><meta property="og:image" content="https://down-vn.img.susercontent.com/file/photo">',{headers:{'content-type':'text/html'}}):new Response(image,{headers:{'content-type':'image/png'}});};
 const result=await runProductImages(f.db,f.owner,{transport});assert.equal(result.results[0].status,'done');assert.equal(f.state.images.length,1);assert.equal(f.state.uploads.length,1);assert.equal(calls,2);assert.match(f.state.uploads[0],/\.webp$/);
 const bytes=await importedWebP(image);const again=await storeImportedImage(f.db,f.owner,f.product,bytes,'same.webp');assert.equal(again.duplicate,true);assert.equal(f.state.uploads.length,1);
 const duplicates=workerFixture();duplicates.state.job.image_urls=['https://down-vn.img.susercontent.com/file/one','https://down-vn.img.susercontent.com/file/two'];duplicates.state.job.max_images=3;const duplicateResult=await runProductImages(duplicates.db,duplicates.owner,{transport});assert.equal(duplicates.state.images.length,1);assert.match(duplicateResult.results[0].message,/1 ảnh WebP mới.*1 ảnh trùng/);
 const manual=workerFixture({existing:true});await runProductImages(manual.db,manual.owner,{transport:async()=>assert.fail()});assert.equal(manual.state.job.status,'done');assert.equal(manual.state.images.length,1);
});
test('blocked pages and wrong product IDs fail the media job only; uncertain metadata response never creates another image',async()=>{
 const blocked=workerFixture();const result=await runProductImages(blocked.db,blocked.owner,{transport:async()=>new Response(null,{status:403})});assert.equal(result.results[0].status,'failed');assert.match(blocked.state.job.error,/403/);assert.equal(blocked.state.images.length,0);
 const mismatch=workerFixture({sourceMismatch:true});await runProductImages(mismatch.db,mismatch.owner,{transport:async()=>assert.fail()});assert.equal(mismatch.state.job.status,'failed');
 const unknown=workerFixture({insertResponseLost:true}),image=await importedWebP(await sharp({create:{width:100,height:100,channels:3,background:'white'}}).png().toBuffer());
 const first=await storeImportedImage(unknown.db,unknown.owner,unknown.product,image,'one.webp');assert.equal(first.duplicate,true);await storeImportedImage(unknown.db,unknown.owner,unknown.product,image,'one.webp');assert.equal(unknown.state.images.length,1);assert.equal(unknown.state.uploads.length,1);
 const expired=workerFixture();await runProductImages(expired.db,expired.owner,{deadline:Date.now()});assert.equal(expired.state.claims,0);
});
