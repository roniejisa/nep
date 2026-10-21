import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {authFailureStatus} from '../lib/admin-access-server.ts';
const raw=await readFile(new URL('../app/api/admin/access/route.ts',import.meta.url),'utf8');
const code=ts.transpileModule(raw.replace(/^import[^\n]+\n/gm,''),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const route=new Function('database','env','authFailureStatus',code.replaceAll('export ', '')+';return {GET};');
const request=token=>new Request('https://local.test/api/admin/access/',{headers:token?{Authorization:'Bearer '+token}:{}});
test('only a server-validated admin passes; invalid tokens, another account and missing auth stay private',async()=>{
 for(const [value,status] of [[{data:{user:{id:'admin'}},error:null},200],[{data:{user:{id:'other'}},error:null},403],[{data:{user:null},error:{status:401}},401]]){
  const {GET}=route(()=>({auth:{getUser:async token=>{assert.equal(token,'test');return value;}}}),()=> 'admin',authFailureStatus);
  const response=await GET(request('test'));assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'private, no-store');const body=await response.json();assert.equal(body.userId,status===200?'admin':undefined);
  assert.equal((await GET(request())).status,401);
 }
});
test('network/rate/configuration failures return 503, never a misleading permission denial or private user data',async()=>{
 for(const error of [{status:503},{status:429},{name:'AuthRetryableFetchError'},{}]){
  assert.equal(authFailureStatus(error),503);const {GET}=route(()=>({auth:{getUser:async()=>({data:{user:null},error})}}),()=> 'admin',authFailureStatus);
  const response=await GET(request('test'));assert.equal(response.status,503);assert.ok(!(await response.json()).userId);
 }
 const {GET}=route(()=>{throw new Error('secret server configuration');},()=> 'admin',authFailureStatus);const response=await GET(request('test'));assert.equal(response.status,503);assert.ok(!(await response.text()).includes('secret'));
});
