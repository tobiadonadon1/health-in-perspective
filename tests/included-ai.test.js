import test from 'node:test';
import assert from 'node:assert/strict';
import {handleChat,includedAI,INCLUDED_MODEL,INCLUDED_DAILY_MESSAGES} from '../supabase/functions/health-api/chat.mjs';

// A small stand-in for the Supabase client: every query resolves to what the table was given.
function fakeClient({connection=null,usedToday=0}={}){
  const inserted=[];
  const query=(table)=>{const q={filters:[]};const result=()=>{
    if(table==='chat_connections')return {data:connection,error:null};
    if(table==='chat_messages'&&q.head)return {count:usedToday,error:null};
    return {data:[],error:null};};
    Object.assign(q,{select:(_c,o)=>{if(o?.head)q.head=true;return q},eq:()=>q,gte:()=>q,order:()=>q,limit:()=>q,
      maybeSingle:async()=>result(),then:(ok,bad)=>Promise.resolve(result()).then(ok,bad),
      insert:async rows=>{inserted.push(...rows);return {error:null}},delete:()=>q,upsert:async()=>({error:null})});
    return q;};
  return {client:{from:query},inserted};
}

test('no house key means no included AI', () => {
  assert.equal(includedAI(''), null);
  assert.deepEqual(includedAI('k'), {provider:'anthropic',model:INCLUDED_MODEL,key:'k',included:true});
});

test('chat-status reports Xeyo AI when the member has no key of their own', async () => {
  const {client}=fakeClient();
  const r=await handleChat({action:'chat-status'},{client,userId:'u',included:includedAI('house')});
  assert.deepEqual(r.connection,{provider:'anthropic',model:INCLUDED_MODEL,included:true});
  const own=fakeClient({connection:{provider:'openai',model:'gpt-4.1-mini',updated_at:'x'}});
  assert.equal((await handleChat({action:'chat-status'},{client:own.client,userId:'u',included:includedAI('house')})).connection.provider,'openai');
});

test('chat-send uses the house key on Claude Haiku 5.5 and saves the answer', async (t) => {
  const calls=[];
  t.mock.method(globalThis,'fetch',async (url,init)=>{calls.push({url,init});return new Response(JSON.stringify({stop_reason:'end_turn',content:[{type:'text',text:'Sleep looks steady.'}]}),{status:200})});
  const {client,inserted}=fakeClient();
  const r=await handleChat({action:'chat-send',message:'How is my sleep?',request_id:crypto.randomUUID(),include_context:false},{client,userId:'u',included:includedAI('house-key')});
  assert.equal(r.answer,'Sleep looks steady.');
  assert.equal(calls[0].url,'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0].init.headers['x-api-key'],'house-key');
  assert.equal(JSON.parse(calls[0].init.body).model,INCLUDED_MODEL);
  assert.equal(inserted.length,2);
});

test('the daily cap stops included chat, not members with their own key', async () => {
  const {client}=fakeClient({usedToday:INCLUDED_DAILY_MESSAGES});
  await assert.rejects(handleChat({action:'chat-send',message:'Hi',request_id:crypto.randomUUID()},{client,userId:'u',included:includedAI('house')}),/today’s 60 Xeyo AI messages/);
});
