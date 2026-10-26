import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
import {providers,providerIds,validateConnection,verifyConnection,listModels,buildRequest,askProvider} from '../supabase/functions/health-api/chat.mjs';
import {analyzeMeal} from '../supabase/functions/health-api/nutrition.mjs';
import {aiProviders} from '../src/ai-providers.js';
const key='test_API_key_for_unit_tests_only_1234',json=body=>({ok:true,json:async()=>body});
const meal={title:'Toast',items:[{name:'Toast',portion:'1 slice',calories:80,protein:3,carbs:14,fat:1,confidence:'medium'}],assumptions:['One slice'],question:null,not_food:false};
const image='data:image/jpeg;base64,'+btoa('jpeg-bytes');
test('every provider uses a fixed HTTPS endpoint and never puts the key in the URL',()=>{
 for(const provider of providerIds){const r=buildRequest({provider,model:providers[provider].model,key,system:'S',messages:[{role:'user',content:'Hi'}]});assert.match(r.url,/^https:\/\/(api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|openrouter\.ai|api\.mistral\.ai|api\.groq\.com|api\.x\.ai|api\.deepseek\.com)\//);assert.ok(!r.url.includes(key));assert.ok(Object.values(r.headers).some(v=>v.includes(key)));}
 assert.deepEqual(Object.keys(aiProviders).sort(),[...providerIds].sort(),'browser and server catalogs list the same providers');
});
test('compatible providers accept vendor-prefixed model IDs only in the request body; path providers stay strict',()=>{
 assert.equal(validateConnection({provider:'openrouter',model:'meta-llama/llama-4-scout:free',key}).model,'meta-llama/llama-4-scout:free');
 for(const model of ['../../models','a//b','https://evil.example/x'])assert.throws(()=>validateConnection({provider:'openrouter',model,key}));
 assert.throws(()=>validateConnection({provider:'anthropic',model:'claude/../x',key}));assert.throws(()=>validateConnection({provider:'gemini',model:'gemini:generate',key}));
 assert.throws(()=>validateConnection({provider:'evil',key}));assert.equal(validateConnection({provider:'anthropic',key}).model,'claude-opus-5-5');
});
test('model lists are read from each provider format, filtered to chat models, and verified on connect',async()=>{
 assert.deepEqual(await listModels({provider:'gemini',key},async()=>json({models:[{name:'models/gemini-x',supportedGenerationMethods:['generateContent']},{name:'models/text-embedding',supportedGenerationMethods:['embedContent']}]})),['gemini-x']);
 assert.deepEqual(await listModels({provider:'openai',key},async()=>json({data:[{id:'gpt-5'},{id:'whisper-1'},{id:'text-embedding-3-small'},{id:'gpt-image-2'}]})),['gpt-5']);
 assert.deepEqual(await listModels({provider:'anthropic',key},async(url,o)=>{assert.equal(o.headers['x-api-key'],key);return json({data:[{id:'claude-opus-5-5'},{id:'claude-haiku-5-5'}]})}),['claude-haiku-5-5','claude-opus-5-5']);
 const calls=[];const fetcher=async url=>{calls.push(String(url));return String(url).endsWith('/key')?json({data:{}}):json({data:[{id:'anthropic/claude-opus-5-5'}]})};
 await verifyConnection({provider:'openrouter',model:'anthropic/claude-opus-5-5',key},fetcher);assert.deepEqual(calls,['https://openrouter.ai/api/v1/key','https://openrouter.ai/api/v1/models']);
 await assert.rejects(verifyConnection({provider:'openrouter',model:'nobody/missing',key},fetcher),/not available/);
 await assert.rejects(verifyConnection({provider:'mistral',key},async()=>({ok:false,status:401})),/rejected/);
 await assert.rejects(listModels({provider:'groq',key},async()=>{throw Error('network '+key)}),e=>!e.message.includes(key));
});
test('chat works through compatible providers and Claude refusals produce a clear message',async()=>{
 let sent;const answer=await askProvider({provider:'deepseek',model:'deepseek-chat',key,messages:[{role:'user',content:'Hi'}]},async(url,o)=>{sent={url,body:JSON.parse(o.body)};return json({choices:[{message:{content:'Hello.'}}]})});
 assert.equal(answer,'Hello.');assert.equal(sent.url,'https://api.deepseek.com/chat/completions');assert.equal(sent.body.messages[0].role,'system');assert.equal(sent.body.messages.at(-1).content,'Hi');
 let claude;await askProvider({provider:'anthropic',model:'claude-opus-5-5',key,messages:[{role:'user',content:'Hi'}]},async(url,o)=>{claude={headers:o.headers,body:JSON.parse(o.body)};return json({content:[{type:'text',text:'ok'}]})});
 assert.equal(claude.body.fallbacks,'default');assert.equal(claude.headers['anthropic-beta'],'server-side-fallback-2026-07-01');assert.ok(claude.body.max_tokens>=8000,'room for adaptive thinking');assert.ok(!('temperature' in claude.body));
 let older;await askProvider({provider:'anthropic',model:'claude-haiku-4-5',key,messages:[{role:'user',content:'Hi'}]},async(url,o)=>{older={headers:o.headers,body:JSON.parse(o.body)};return json({content:[{type:'text',text:'ok'}]})});assert.ok(!older.body.fallbacks&&!older.headers['anthropic-beta']);
 await assert.rejects(askProvider({provider:'anthropic',model:'claude-opus-5-5',key,messages:[{role:'user',content:'Hi'}]},async()=>json({stop_reason:'refusal',content:[]})),/declined/);await assert.rejects(askProvider({provider:'anthropic',model:'claude-opus-5-5',key,messages:[{role:'user',content:'Hi'}]},async()=>json({stop_reason:'max_tokens',content:[{type:'thinking',thinking:'…'}]})),/ran out of room/);
});
test('meal photos are analyzed by Claude, Gemini and compatible providers with the same strict validation',async()=>{
 for(const provider of ['anthropic','gemini','openrouter']){
  let body;const result=await analyzeMeal({text:'toast',image},{provider,model:providers[provider].model,apiKey:key,fetcher:async(url,o)=>{body=JSON.parse(o.body);const text='Here you go:\n```json\n'+JSON.stringify(meal)+'\n```';return json(provider==='anthropic'?{content:[{type:'text',text}]}:provider==='gemini'?{candidates:[{content:{parts:[{text}]}}]}:{choices:[{message:{content:text}}]})}});
  assert.equal(result.items[0].calories,80);const serialized=JSON.stringify(body);assert.ok(serialized.includes(btoa('jpeg-bytes')),provider+' receives the photo');assert.ok(serialized.includes('json')||serialized.includes('JSON'));
 }
 await assert.rejects(analyzeMeal({text:'toast'},{provider:'anthropic',model:'claude-opus-5-5',apiKey:key,fetcher:async()=>json({content:[{type:'text',text:'{"title":"x","items":[{"name":"x","calories":-5}]}'}]})}),/incomplete|could not be read|invalid/);
 await assert.rejects(analyzeMeal({text:'toast'},{provider:'groq',model:'llama',apiKey:key,fetcher:async()=>({ok:false,status:429})}),/usage limit/);
});
test('migration widens provider constraints on existing tables without accepting unknown providers',async()=>{
 const db=new PGlite(),user='11111111-1111-4111-8111-111111111111';
 try{
  const chat=fs.readFileSync('supabase/migrations/20261022230000_profiles_peers_chat.sql','utf8'),journal=fs.readFileSync('supabase/migrations/20261023144529_private_health_journal.sql','utf8');
  await db.exec(`create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${user}');create table public.journal_entries(id uuid primary key,user_id uuid not null,unique(id,user_id));insert into public.journal_entries values('${user}','${user}');`);
  await db.exec(chat.slice(chat.indexOf('create table public.chat_connections'),chat.indexOf('alter table public.chat_connections')));
  await db.exec(journal.slice(journal.indexOf('create table public.journal_reflections'),journal.indexOf(');',journal.indexOf('create table public.journal_reflections'))+2));
  await assert.rejects(db.exec(`insert into public.chat_connections values('${user}','openrouter','m','k')`));
  await db.exec(fs.readFileSync('supabase/migrations/20261025120000_any_ai_provider.sql','utf8'));
  await db.exec(`insert into public.chat_connections values('${user}','openrouter','meta-llama/x','k')`);
  await db.exec(`insert into public.journal_reflections(entry_id,user_id,entry_content,provider,model) values('${user}','${user}','note','deepseek','deepseek-chat')`);
  await assert.rejects(db.exec(`update public.chat_connections set provider='evil'`));
  assert.match(fs.readFileSync('database/schema.sql','utf8'),/'openrouter','mistral','groq','xai','deepseek'/);
 }finally{await db.close()}
});
