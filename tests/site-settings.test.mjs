import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('site settings are publicly readable but only server role can modify them',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;');
  const sql=await readFile(new URL('../supabase/site-settings.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
  await db.exec(`set role service_role;insert into affiliate_site_settings(id,value) values(1,'{"name":"Nếp"}');set role anon;`);
  assert.equal((await db.query('select value from affiliate_site_settings')).rows[0].value.name,'Nếp');
  await assert.rejects(db.query('delete from affiliate_site_settings'),e=>e.code==='42501');
  await db.exec('set role authenticated');await assert.rejects(db.query("update affiliate_site_settings set value='{}'"),e=>e.code==='42501');
  await db.exec('set role service_role');await assert.rejects(db.query("insert into affiliate_site_settings(id,value) values(2,'{}')"),e=>e.code==='23514');
 }finally{await db.close();}
});
