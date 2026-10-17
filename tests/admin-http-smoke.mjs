// Run after npm run build. Read-only SSR/redirect checks, not a browser visual test.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import next from 'next';
const originalFetch=globalThis.fetch;
globalThis.fetch=(input,options)=>{const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;if(url.includes('aegbygaxnynjfkmogpbg.supabase.co'))return Promise.resolve(Response.json({error:'Mock public site settings unavailable'},{status:503}));return originalFetch(input,options);};
const app=next({dev:false,dir:new URL('../',import.meta.url).pathname,hostname:'127.0.0.1',port:0,quiet:true});
let server;
try{
 await app.prepare();const handle=app.getRequestHandler();server=createServer((req,res)=>handle(req,res));await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const base=`http://127.0.0.1:${server.address().port}`;
 const root=await originalFetch(base+'/',{redirect:'manual'});assert.equal(root.status,307);assert.equal(root.headers.get('location'),'/san-pham/');
 const oauth=await originalFetch(base+'/?facebook_result=choose',{redirect:'manual'});assert.equal(oauth.status,307);assert.equal(oauth.headers.get('location'),'/cai-dat/?facebook_result=choose');
 for(const path of ['san-pham','thu-vien','noi-dung','cai-dat','automation','categories','san-pham/nhap']){
  const response=await originalFetch(`${base}/${path}/`);assert.equal(response.status,200,path);const html=await response.text();
  assert.ok(html.includes('Đăng nhập quản trị'),path+' has an authentication gate');
  assert.ok(!html.includes('aria-label="Điều hướng chính"'),path+' does not render private navigation');
  assert.ok(!html.includes('class="app-shell"'),path+' does not render the workspace');
  const reload=await originalFetch(`${base}/${path}/`);assert.equal(reload.status,200,path+' reload');await reload.arrayBuffer();
 }
 for(const path of ['admin/access','admin/initial-links','categories','automation','content/status','integrations/status','product-videos','product-import']) {
  const response=await originalFetch(`${base}/api/${path}/`);
  assert.ok(response.status>=400,path+' denies anonymous access');
  const result=await response.json();assert.ok(result.error,path+' returns an error');
  assert.ok(!result.products&&!result.jobs&&!result.connections,path+' contains no private records');
 }
 for(const path of ['product-import','product-import/upload']){const response=await originalFetch(`${base}/api/${path}/`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.ok(response.status>=400,'anonymous import/upload denied');}
 const cronImages=await originalFetch(`${base}/api/product-import/images/`,{headers:{Authorization:'Bearer invalid-test-cron'}});assert.equal(cronImages.status,401,'media cron requires its secret');
 const anonymousPublish=await originalFetch(`${base}/api/content/publish/`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'publish',approved:true,postId:'anything',body:'test'})});
 assert.ok(anonymousPublish.status>=400,'anonymous post/comment publish denied');
 const denied=await originalFetch(`${base}/api/admin/access/`,{headers:{Authorization:'Bearer invalid-test-token'}});
 assert.equal(denied.status,403);assert.equal(denied.headers.get('cache-control'),'private, no-store');
 for(const method of ['POST','DELETE']){const response=await originalFetch(`${base}/api/product-videos/`,{method,headers:{'Content-Type':'application/json'},body:'{}'});assert.ok(response.status>=400,'anonymous video mutation denied');}
 console.log('PASS: redirects; 7 anonymous routes and reloads show only the access gate; 8 private APIs deny anonymous access; video writes denied; post/comment publish denied; import/upload/cron denied; invalid token denied.');
}finally{
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await app.close();globalThis.fetch=originalFetch;
}
