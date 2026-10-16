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
 for(const path of ['san-pham','thu-vien','noi-dung','cai-dat','automation','categories']){
  const response=await originalFetch(`${base}/${path}/`);assert.equal(response.status,200,path);const html=await response.text();
  const active=(html.match(/<a\b[^>]*>/g)||[]).filter(a=>a.includes('aria-current="page"'));
  assert.equal(active.length,1,path+' has one active menu item');assert.ok(active[0].includes(`href="/${path}/"`),path+' active link points to its URL');
  assert.equal((html.match(/aria-label="Điều hướng chính"/g)||[]).length,1,path+' has one shared navigation');
  const reload=await originalFetch(`${base}/${path}/`);assert.equal(reload.status,200,path+' reload');await reload.arrayBuffer();
 }
 console.log('PASS: 2 redirects; 6 direct routes; 6 reload requests; one correctly active menu and shared navigation per route.');
}finally{
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await app.close();globalThis.fetch=originalFetch;
}
