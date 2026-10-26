import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
import {validateLabResult} from '../src/domain.js';
test('journal mood is optional, constrained, owner-writable and keeps reflections; labs accept signed values',async()=>{
 const db=new PGlite(),a='11111111-1111-4111-8111-111111111111',entry='33333333-3333-4333-8333-333333333333';
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth,public to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated;insert into auth.users values('${a}');`);
  await db.exec(fs.readFileSync('supabase/migrations/20261023144529_private_health_journal.sql','utf8'));
  const labs=fs.readFileSync('supabase/migrations/20261022185822_private_reports_and_lab_results.sql','utf8');
  await db.exec(labs.slice(labs.indexOf('create table public.lab_results'),labs.indexOf('alter table public.oauth_states')));
  await db.exec(fs.readFileSync('supabase/migrations/20261026120000_journal_mood_and_signed_labs.sql','utf8'));
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${a}';insert into public.journal_entries(id,user_id,content,mood) values('${entry}','${a}','Slept badly','low');`);
  await assert.rejects(db.exec(`update public.journal_entries set mood='ecstatic'`),'unknown moods are rejected');
  await db.exec(`reset role;set role service_role;insert into public.journal_reflections(entry_id,user_id,entry_content,provider,model,status,content) values('${entry}','${a}','Slept badly','openai','test','ready','AI text');`);
  await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${a}';update public.journal_entries set mood='okay';update public.journal_entries set mood=null;`);
  assert.equal((await db.query('select count(*)::int n from public.journal_reflections')).rows[0].n,1,'changing only the mood keeps the reflection');
  await db.exec(`insert into public.lab_results(user_id,marker,value,unit,collected_on,reference_low,reference_high) values('${a}','Base excess',-2.4,'mmol/L','2026-10-20',-3,3)`);
  await assert.rejects(db.exec(`insert into public.lab_results(user_id,marker,value,unit,collected_on) values('${a}','${'x'.repeat(121)}',1,'u','2026-10-20')`));
 }finally{await db.close()}
 assert.equal(validateLabResult({marker:'Base excess',unit:'mmol/L',value:'-2.4',reference_low:'-3',reference_high:'3',collected_on:'2026-10-20'}).value,-2.4);
 assert.throws(()=>validateLabResult({marker:'x'.repeat(121),unit:'u',value:'1',collected_on:'2026-10-20'}),/120 characters/);
});
