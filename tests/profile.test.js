import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
import {validateProfile,metricSummary} from '../src/profile/domain.js';
test('onboarding validates explicit choices and adult age',()=>{const p={representation:'photo',gender:'woman',age:'29',peer_opt_in:false};assert.equal(validateProfile(p).age,29);assert.equal(validateProfile(p).peer_opt_in,false);for(const patch of [{age:17},{age:''},{age:25.5},{age:121},{representation:'other'},{gender:''}])assert.throws(()=>validateProfile({...p,...patch}));assert.equal(validateProfile({...p,gender:'unspecified',representation:'stats'}).representation,'stats')});
test('averages weight UTC days equally, excluding missing and future days',()=>{const now=Date.parse('2026-10-22T12:00Z');const stats=metricSummary([{value:60,observed_at:'2026-10-21T01:00Z'},{value:80,observed_at:'2026-10-21T20:00Z'},{value:90,observed_at:'2026-10-20T10:00Z'},{value:500,observed_at:'2026-11-01T10:00Z'},{value:500,observed_at:'2026-08-01T10:00Z'},{value:null,observed_at:'2026-10-19T10:00Z'}],{now});assert.deepEqual(stats,{mean:80,days:2,min:70,max:90});assert.equal(metricSummary([]).mean,null)});
test('profiles, private chat and real peer percentiles enforce ownership and suppression',async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth,public,storage to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;`);
 await db.exec(fs.readFileSync('database/schema.sql','utf8'));
 // Fresh-install schema includes the new migration.
 const ids=Array.from({length:25},(_,i)=>`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
 for(const [i,id]of ids.entries()){
  await db.query('insert into auth.users values($1)',[id]);
  await db.query("insert into public.profiles(user_id,representation,gender,age,peer_opt_in) values($1,'stats','unspecified',$2,$3)",[id,i===22?35:25,i!==23]);
  for(let day=1;day<=8;day++)await db.query("insert into public.health_readings(user_id,kind,value,unit,source,external_id,observed_at) values($1,'resting_hr',$2,'bpm',$3,$4,now()-$5*interval '1 day')",[id,i===0?60:51+i,i===24?'Apple import':'WHOOP',String(day),day]);
 }
 // User 22 has fewer than 7 recorded days, so they do not enter the cohort.
 await db.query("delete from public.health_readings where user_id=$1 and external_id in ('3','4','5','6','7','8')",[ids[21]]);
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${ids[0]}'`);
 assert.equal((await db.query('select * from public.profiles')).rows.length,1);
 await assert.rejects(db.query('update public.profiles set user_id=$1',[ids[1]]));
 await assert.rejects(db.query("insert into public.profiles(user_id,gender,age) values($1,'woman',26)",[ids[1]]));
 let result=(await db.query('select public.peer_percentiles() as result')).rows[0].result;
 assert.equal(result.status,'ok');assert.equal(result.age_min,18);assert.equal(result.age_max,29);
 assert.equal(result.metrics[0].peer_count,20);assert.equal(result.metrics[0].percentile,42.5);assert.equal(result.metrics[0].mean,60);
 assert.equal(result.metrics[0].peer_mean,61.5);
 await assert.rejects(db.query('select * from public.chat_connections'));
 await assert.rejects(db.query("insert into public.chat_messages(user_id,request_id,role,content,provider,model) values($1,gen_random_uuid(),'assistant','forged','openai','test')",[ids[0]]));
 await db.exec('reset role');
 const record=(await db.query("insert into public.records(user_id,name,path,kind,mime) values($1,'private photo',$2,'photo','image/png') returning id",[ids[1],ids[1]+'/photo.png'])).rows[0].id;
 await db.query("insert into public.chat_messages(user_id,request_id,role,content,provider,model) values($1,gen_random_uuid(),'user','private message','openai','test')",[ids[1]]);
 await db.query('update public.profiles set peer_opt_in=false where user_id=$1',[ids[1]]);
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${ids[0]}'`);
 await assert.rejects(db.query('update public.profiles set photo_record_id=$1',[record]));
 assert.equal((await db.query('select * from public.chat_messages')).rows.length,0);
 result=(await db.query('select public.peer_percentiles() as result')).rows[0].result;
 assert.equal(result.metrics[0].status,'growing');for(const k of ['peer_count','peer_mean','percentile'])assert.equal(result.metrics[0][k],null);
 await db.exec('update public.profiles set peer_opt_in=false');assert.equal((await db.query('select public.peer_percentiles() as result')).rows[0].result.status,'opt_in_required');
 await db.exec("update public.profiles set peer_opt_in=true,age_updated_on=current_date-400");assert.equal((await db.query('select public.peer_percentiles() as result')).rows[0].result.status,'age_refresh_required');
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from public.profiles'));await assert.rejects(db.query('select public.peer_percentiles()'));
 }finally{await db.close()}});
