import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {stateHash,sameState,encryptToken,decryptToken} from '../lib/instagram-oauth-crypto.ts';
import {instagramAuthURL,exchangeInstagramCode} from '../lib/instagram-oauth.ts';
import {publishSocial} from '../lib/social-publish.ts';
test('authorization asks Instagram for the two business permissions and binds the callback/state',()=>{
 const url=new URL(instagramAuthURL('123','https://nep-hp.vercel.app/api/instagram/callback','random-nonce'));
 assert.equal(url.origin,'https://www.instagram.com');assert.equal(url.searchParams.get('client_id'),'123');assert.equal(url.searchParams.get('state'),'random-nonce');assert.equal(url.searchParams.get('redirect_uri'),'https://nep-hp.vercel.app/api/instagram/callback');assert.equal(url.searchParams.get('scope'),'instagram_business_basic,instagram_business_content_publish');
 assert.ok(sameState('same','same'));assert.ok(!sameState('same','wrong'));assert.ok(!sameState('',''));assert.equal(stateHash('one').length,64);
});
test('stored tokens are authenticated ciphertext; wrong keys and modified ciphertext fail',()=>{
 const encrypted=encryptToken('private-instagram-token','app-secret');assert.ok(!encrypted.includes('private-instagram-token'));assert.equal(decryptToken(encrypted,'app-secret'),'private-instagram-token');assert.notEqual(encryptToken('private-instagram-token','app-secret'),encrypted);assert.throws(()=>decryptToken(encrypted,'different-secret'));
 const parts=encrypted.split('.');parts[3]=(parts[3][0]==='A'?'B':'A')+parts[3].slice(1);assert.throws(()=>decryptToken(parts.join('.'),'app-secret'));
});
test('code exchange keeps secrets server-side and exchanges for long-lived token',async()=>{
 let calls=0;
 const value=await exchangeInstagramCode({appId:'123',appSecret:'secret',redirectURI:'https://nep-hp.vercel.app/api/instagram/callback',code:'code',transport:async(url,options)=>{
  calls++;if(calls===1){assert.equal(url,'https://api.instagram.com/oauth/access_token');assert.equal(options.method,'POST');assert.equal(options.body.get('client_secret'),'secret');assert.equal(options.body.get('redirect_uri'),'https://nep-hp.vercel.app/api/instagram/callback');return Response.json({access_token:'short-token',user_id:123});}
  const parsed=new URL(url);assert.equal(parsed.origin,'https://graph.instagram.com');assert.equal(parsed.searchParams.get('grant_type'),'ig_exchange_token');assert.equal(parsed.searchParams.get('access_token'),'short-token');return Response.json({access_token:'long-token',expires_in:5184000});
 }});assert.equal(calls,2);assert.equal(value.token,'long-token');
 await assert.rejects(exchangeInstagramCode({appId:'1',appSecret:'secret',redirectURI:'https://example.com',code:'bad',transport:async()=>Response.json({error:'secret'},{status:400})}),e=>!e.message.includes('secret'));
});
test('Instagram Login publishing uses graph.instagram.com for every container/publish call',async()=>{
 const urls=[];await publishSocial({channel:'instagram',body:'caption',imageUrl:'https://nep-hp.vercel.app/image.jpg',target:{id:'123',token:'token',version:'v26.0',instagramLogin:'instagram'},onContainer:async()=>{},transport:async(url,options)=>{urls.push(url);assert.equal(new URL(url).hostname,'graph.instagram.com');return Response.json(options.method==='GET'?{status_code:'FINISHED'}:{id:url.includes('media_publish')?'published':'container'});}});
 assert.equal(urls.length,3);assert.ok(urls.at(-1).endsWith('/123/media_publish'));
});
test('OAuth tables are server-only and a nonce can be redeemed exactly once',async()=>{
 const db=new PGlite();const owner='11111111-1111-4111-8111-111111111111';try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public to anon,authenticated,service_role;insert into auth.users values('${owner}');`);
  const migration=await readFile(new URL('../supabase/instagram-oauth.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
  await db.exec(`set role service_role;insert into affiliate_instagram_oauth_states(state_hash,owner_id,expires_at) values('hash','${owner}',now()+interval '10 minutes');`);
  const redeem=()=>db.query("update affiliate_instagram_oauth_states set used=true where state_hash='hash' and used=false and expires_at>now() returning owner_id");const results=await Promise.all([redeem(),redeem()]);assert.equal(results.reduce((sum,r)=>sum+r.rows.length,0),1);
  await db.exec(`insert into affiliate_instagram_oauth_states(state_hash,owner_id,expires_at) values('expired','${owner}',now()-interval '1 second');`);assert.equal((await db.query("update affiliate_instagram_oauth_states set used=true where state_hash='expired' and expires_at>now() returning owner_id")).rows.length,0);
  await db.exec('set role anon');await assert.rejects(db.query('select * from affiliate_instagram_connections'),e=>e.code==='42501');
  await db.exec('set role authenticated');await assert.rejects(db.query('select * from affiliate_instagram_oauth_states'),e=>e.code==='42501');await assert.rejects(db.query("delete from affiliate_instagram_connections"),e=>e.code==='42501');
 }finally{await db.close();}
});
