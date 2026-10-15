import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { composePost, validatePost, DISCLOSURE } from '../lib/content-rules.ts';
test('affiliate URL remains exact and Threads counts the entire final message',()=>{
 const link='https://s.shopee.vn/4LK8gjOA0T';
 const text=composePost('Một lựa chọn cho gia đình.',link);
 assert.ok(text.endsWith(link));assert.ok(text.includes(DISCLOSURE));
 assert.doesNotThrow(()=>validatePost('threads',text));
 assert.throws(()=>composePost('test','javascript:alert(1)'));
 assert.throws(()=>validatePost('threads',composePost('x'.repeat(490),link)));
 assert.doesNotThrow(()=>validatePost('threads','🙂'.repeat(500)));
});
test('content SQL isolates readers, blocks browser writes and claims a draft once',async()=>{
 const db=new PGlite();const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table public.affiliate_products(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,service_role,anon;insert into auth.users values('${a}'),('${b}');`);
  const migration=await readFile(new URL('../supabase/content.sql',import.meta.url),'utf8');
  await db.exec(migration);await db.exec(migration);
  await db.exec(`set role service_role;insert into affiliate_content_posts(owner_id,channel,body) values('${a}','facebook','A'),('${b}','threads','B');insert into affiliate_content_runs(owner_id) values('${a}');`);
  await assert.rejects(db.query('insert into affiliate_content_runs(owner_id) values($1)',[a]),e=>e.code==='23505');
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${a}',false);`);
  assert.equal((await db.query('select * from affiliate_content_posts')).rows.length,1);
  await assert.rejects(db.query("update affiliate_content_posts set status='published'"),e=>e.code==='42501');
  await assert.rejects(db.query("insert into affiliate_content_posts(owner_id,channel,body) values($1,'facebook','forged')",[a]),e=>e.code==='42501');
  await db.exec('set role anon');await assert.rejects(db.query('select * from affiliate_content_posts'),e=>e.code==='42501');
  await db.exec('set role service_role');
  const claim=()=>db.query("update affiliate_content_posts set status='publishing' where owner_id=$1 and status='draft' returning id",[a]);
  const results=await Promise.all([claim(),claim()]);assert.equal(results.reduce((n,r)=>n+r.rows.length,0),1);
 }finally{await db.close();}
});
