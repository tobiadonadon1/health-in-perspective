import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('journal isolates owners, protects AI output and discards stale reflections on edits or deletion',async()=>{
 const db=new PGlite(),a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',entry='33333333-3333-4333-8333-333333333333';
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth,public to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated;insert into auth.users values('${a}'),('${b}');`);
  await db.exec(fs.readFileSync('supabase/migrations/20261023144529_private_health_journal.sql','utf8'));
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${a}';insert into public.journal_entries(id,user_id,content) values('${entry}','${a}','A test note');`);
  assert.equal((await db.query('select * from public.journal_entries')).rows.length,1);
  await assert.rejects(db.exec(`insert into public.journal_entries(user_id,content) values('${b}','Forged owner')`));
  await assert.rejects(db.exec(`update public.journal_entries set user_id='${b}'`));
  await assert.rejects(db.exec(`insert into public.journal_reflections(entry_id,user_id,entry_content,provider,model) values('${entry}','${a}','A test note','openai','test')`));
  await db.exec(`reset role;set role service_role;insert into public.journal_reflections(entry_id,user_id,entry_content,provider,model,status,content) values('${entry}','${a}','A test note','openai','test','ready','AI text');`);
  await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${b}'`);
  assert.equal((await db.query('select * from public.journal_entries')).rows.length,0);assert.equal((await db.query('select * from public.journal_reflections')).rows.length,0);
  await db.exec(`delete from public.journal_entries;delete from public.journal_reflections;set request.jwt.claim.sub='${a}'`);
  assert.equal((await db.query('select * from public.journal_entries')).rows.length,1);assert.equal((await db.query('select * from public.journal_reflections')).rows.length,1);
  await assert.rejects(db.exec(`update public.journal_reflections set content='forged'`));
  await db.exec(`update public.journal_entries set content='Edited note' where id='${entry}'`);assert.equal((await db.query('select * from public.journal_reflections')).rows.length,0);
  await db.exec('reset role;set role service_role');
  await assert.rejects(db.exec(`insert into public.journal_reflections(entry_id,user_id,entry_content,provider,model) values('${entry}','${a}','A test note','openai','test')`));
  await assert.rejects(db.exec(`insert into public.journal_reflections(entry_id,user_id,entry_content,provider,model) values('${entry}','${b}','Edited note','openai','test')`));
  await db.exec(`insert into public.journal_reflections(entry_id,user_id,entry_content,provider,model) values('${entry}','${a}','Edited note','openai','test');reset role;set role authenticated;set request.jwt.claim.sub='${a}';delete from public.journal_entries where id='${entry}';`);
  assert.equal((await db.query('select * from public.journal_reflections')).rows.length,0);
  await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from public.journal_entries'));await assert.rejects(db.query('select * from public.journal_reflections'));
 }finally{await db.close()}
});
