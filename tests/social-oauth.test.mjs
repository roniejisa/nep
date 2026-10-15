import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {socialAuthURL,exchangeSocialCode,listFacebookPages,refreshThreadsToken} from '../lib/social-oauth.ts';
test('separate platform authorization URLs bind state/callback and use the right scopes',()=>{
 const fb=new URL(socialAuthURL('facebook','123','https://nep-hp.vercel.app/api/facebook/callback','fb-state','v26.0'));assert.equal(fb.hostname,'www.facebook.com');assert.equal(fb.searchParams.get('scope'),'pages_show_list,pages_read_engagement,pages_manage_posts');assert.equal(fb.searchParams.get('state'),'fb-state');
 const th=new URL(socialAuthURL('threads','456','https://nep-hp.vercel.app/api/threads/callback','th-state','v1.0'));assert.equal(th.hostname,'threads.com');assert.equal(th.searchParams.get('scope'),'threads_basic,threads_content_publish');assert.equal(th.searchParams.get('client_id'),'456');
 const business=new URL(socialAuthURL('facebook','123','https://example.com','state','v26.0','789'));assert.equal(business.searchParams.get('config_id'),'789');assert.equal(business.searchParams.has('scope'),false);
});
for(const provider of ['facebook','threads'])test(`${provider} exchanges code for a platform-specific long-lived token`,async()=>{
 let calls=0;const result=await exchangeSocialCode({provider,appId:'123',appSecret:'private-secret',redirectURI:`https://nep-hp.vercel.app/api/${provider}/callback`,code:'code',version:provider==='facebook'?'v26.0':'v1.0',transport:async(url,options)=>{
  calls++;assert.equal(new URL(url).hostname,provider==='facebook'?'graph.facebook.com':'graph.threads.net');
  if(calls===1){const params=provider==='facebook'?new URL(url).searchParams:options.body;assert.equal(params.get('redirect_uri'),`https://nep-hp.vercel.app/api/${provider}/callback`);assert.equal(params.get('client_secret'),'private-secret');return Response.json({access_token:'short'});}
  const params=new URL(url).searchParams;assert.equal(params.get('grant_type'),provider==='facebook'?'fb_exchange_token':'th_exchange_token');return Response.json({access_token:'long',expires_in:5184000});
 }});assert.equal(calls,2);assert.equal(result.token,'long');assert.equal(result.expiresIn,5184000);
});
test('Page discovery follows fixed-host cursors, never a provider-supplied arbitrary next URL',async()=>{
 let calls=0;const pages=await listFacebookPages('user-token','secret','v26.0',async(url,options)=>{calls++;const parsed=new URL(url);assert.equal(parsed.hostname,'graph.facebook.com');assert.ok(parsed.searchParams.get('appsecret_proof'));assert.equal(options.headers.Authorization,'Bearer user-token');if(calls===1)return Response.json({data:[{id:'1',name:'Page One',access_token:'page-secret-1'}],paging:{next:'https://malicious.example/leak',cursors:{after:'cursor'}}});assert.equal(parsed.searchParams.get('after'),'cursor');return Response.json({data:[{id:'2',name:'Page Two',access_token:'page-secret-2'}]});});assert.equal(pages.length,2);assert.equal(calls,2);
});
test('Threads refresh uses the correct grant and provider errors do not expose secret values',async()=>{
 const result=await refreshThreadsToken('private-token',async(url)=>{const params=new URL(url).searchParams;assert.equal(params.get('grant_type'),'th_refresh_token');assert.equal(params.get('access_token'),'private-token');return Response.json({access_token:'refreshed',expires_in:5184000});});assert.equal(result.token,'refreshed');
 await assert.rejects(exchangeSocialCode({provider:'threads',appId:'1',appSecret:'private',redirectURI:'https://example.com',code:'bad',transport:async()=>Response.json({error:{message:'private'}},{status:400})}),e=>!e.message.includes('private'));
});
test('social OAuth schema isolates platforms, locks nonce redemption, and blocks browser token access',async()=>{
 const db=new PGlite();const owner='11111111-1111-4111-8111-111111111111';try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public to anon,authenticated,service_role;insert into auth.users values('${owner}');`);
  const sql=await readFile(new URL('../supabase/social-oauth.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
  await db.exec(`set role service_role;insert into affiliate_social_oauth_states(state_hash,owner_id,provider,expires_at) values('fb','${owner}','facebook',now()+interval '10 minutes');`);
  assert.equal((await db.query("update affiliate_social_oauth_states set used=true where state_hash='fb' and provider='threads' and used=false returning owner_id")).rows.length,0);
  const redeem=()=>db.query("update affiliate_social_oauth_states set used=true where state_hash='fb' and provider='facebook' and used=false and expires_at>now() returning owner_id");const results=await Promise.all([redeem(),redeem()]);assert.equal(results.reduce((sum,r)=>sum+r.rows.length,0),1);
  await db.exec(`insert into affiliate_social_connections(owner_id,provider,actor_id,display_name,token_encrypted) values('${owner}','facebook','123','Page','encrypted');insert into affiliate_social_connections(owner_id,provider,actor_id,display_name,token_encrypted) values('${owner}','threads','456','Threads','encrypted');update affiliate_social_connections set active=false,token_encrypted=null where provider='facebook';`);
  assert.equal((await db.query("select active from affiliate_social_connections where provider='threads'")).rows[0].active,true);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);for(const table of ['affiliate_social_connections','affiliate_social_oauth_states','affiliate_facebook_page_choices'])await assert.rejects(db.query('select * from '+table),e=>e.code==='42501');}
 }finally{await db.close();}
});
