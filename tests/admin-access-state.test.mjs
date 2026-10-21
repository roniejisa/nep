import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAccessController,ACCESS_GRACE_MS,ACCESS_CACHE_MS} from '../lib/admin-access-state.ts';
const session=(token='token-a',id='admin')=>({access_token:token,user:{id}});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(overrides={}){
 let clock=1000000,current=session(),check=async s=>({status:200,userId:s.user.id}),reads=0,calls=0,renewals=0;const history=[];
 const controller=createAccessController({now:()=>clock,onChange:s=>history.push({...s}),getSession:async()=>{reads++;return current;},refreshSession:async()=>{renewals++;return null;},check:(...args)=>{calls++;return check(...args);},...overrides});
 return {controller,history,advance:n=>clock+=n,setSession:s=>current=s,setCheck:fn=>check=fn,counts:()=>({reads,calls,renewals})};
}
test('focus, visibility and repeated SIGNED_IN for the same account never unmount an allowed workspace',async()=>{
 const f=fixture();await f.controller.refresh();assert.equal(f.controller.snapshot().view,'allowed');f.history.length=0;
 for(let i=0;i<20;i++)await Promise.all([f.controller.refresh(),f.controller.refresh(),f.controller.sessionChanged(session())]);
 assert.equal(f.counts().calls,1);assert.ok(f.history.every(s=>s.view==='allowed'));
 f.advance(ACCESS_CACHE_MS+1);const pending=deferred();f.setCheck(()=>pending.promise);
 const checks=Promise.all([f.controller.sessionChanged(session()),f.controller.refresh(),f.controller.refresh()]);await Promise.resolve();await Promise.resolve();
 assert.equal(f.controller.snapshot().view,'allowed');assert.equal(f.counts().calls,2);pending.resolve({status:200,userId:'admin'});await checks;
 assert.ok(f.history.every(s=>s.view==='allowed'));f.controller.stop();
});
test('token refresh checks in the background and ignores an older in-flight response',async()=>{
 const f=fixture();await f.controller.refresh();f.history.length=0;f.advance(ACCESS_CACHE_MS+1);
 const old=deferred();f.setCheck(s=>s.access_token==='token-a'?old.promise:Promise.resolve({status:200,userId:'admin'}));
 const first=f.controller.sessionChanged(session()),next=f.controller.sessionChanged(session('token-b'));await next;
 old.resolve({status:403});await first;assert.equal(f.controller.snapshot().view,'allowed');assert.ok(f.history.every(s=>s.view==='allowed'));f.controller.stop();
});
test('a temporary outage preserves the same-account workspace for a bounded lease, then offers retry without claiming logout',async()=>{
 const f=fixture();await f.controller.refresh();f.advance(ACCESS_CACHE_MS+1);f.setCheck(async()=>({status:503}));await f.controller.refresh();
 assert.equal(f.controller.snapshot().view,'allowed');assert.ok(f.controller.snapshot().warning);
 f.advance(ACCESS_GRACE_MS);f.controller.tick();assert.equal(f.controller.snapshot().view,'unavailable');assert.ok(f.controller.snapshot().error.includes('chưa bị đăng xuất'));
 f.setCheck(async()=>({status:200,userId:'admin'}));await f.controller.refresh(true);assert.equal(f.controller.snapshot().view,'allowed');assert.equal(f.controller.snapshot().warning,'');f.controller.stop();
});
test('initial offline state never exposes children and does not masquerade as an incorrect password',async()=>{
 const f=fixture();f.setCheck(async()=>{throw new Error('network')});await f.controller.refresh();assert.equal(f.controller.snapshot().view,'unavailable');assert.ok(!f.controller.snapshot().error.includes('mật khẩu'));f.controller.stop();
});
test('sign-out and account switching hide private UI immediately; late success cannot reopen it',async()=>{
 const f=fixture();await f.controller.refresh();const pending=deferred();f.setCheck(()=>pending.promise);
 const switched=f.controller.sessionChanged(session('other-token','other'));assert.equal(f.controller.snapshot().view,'checking');
 await f.controller.sessionChanged(null);assert.equal(f.controller.snapshot().view,'login');pending.resolve({status:200,userId:'other'});await switched;assert.equal(f.controller.snapshot().view,'login');f.controller.stop();
});
test('server denial, wrong user and expired sessions lock even within the recent successful lease',async()=>{
 for(const response of [{status:403},{status:200,userId:'not-admin'},{status:401}]){
  const f=fixture();await f.controller.refresh();f.setCheck(async()=>response);await f.controller.refresh(true);assert.equal(f.controller.snapshot().view,'login');f.controller.stop();
 }
});
test('a rejected access token gets one refresh attempt and a valid renewed token preserves the workspace',async()=>{
 let calls=0,renewals=0;const history=[];
 const controller=createAccessController({getSession:async()=>session(),refreshSession:async()=>{renewals++;return session('fresh');},check:async s=>{calls++;return s.access_token==='fresh'?{status:200,userId:'admin'}:{status:401};},onChange:s=>history.push(s)});
 await controller.refresh();assert.equal(controller.snapshot().view,'allowed');assert.equal(renewals,1);assert.equal(calls,2);controller.stop();
});
test('SDK TOKEN_REFRESHED events cannot cause endless refresh when the server still rejects every token',async()=>{
 let calls=0,renewals=0,controller;
 controller=createAccessController({getSession:async()=>session(),refreshSession:async()=>{renewals++;const next=session('refresh-'+renewals);void controller.sessionChanged(next);return next;},check:async()=>{calls++;return {status:401};},onChange:()=>{}});
 await controller.refresh();await new Promise(resolve=>setImmediate(resolve));assert.equal(renewals,1);assert.equal(calls,2);assert.equal(controller.snapshot().view,'login');controller.stop();
});
test('a session read started before sign-out and a disposed controller cannot restore stale UI',async()=>{
 const read=deferred(),history=[];const f=fixture({getSession:()=>read.promise,onChange:s=>history.push(s)});
 const initial=f.controller.refresh();await Promise.resolve();await f.controller.sessionChanged(null);read.resolve(session());await initial;assert.equal(f.controller.snapshot().view,'login');
 f.controller.stop();const before=history.length;await f.controller.sessionChanged(session());assert.equal(history.length,before);
});
