import test from 'node:test';
import assert from 'node:assert/strict';
import {handleChat,includedAI,INCLUDED_MODEL,INCLUDED_DAILY_MESSAGES} from '../supabase/functions/health-api/chat.mjs';
import {AI_PLAN,aiCostMicros,aiAllowance,meteredAI} from '../supabase/functions/health-api/entitlements.mjs';

// A small stand-in for the Supabase client: every query resolves to what the table was given.
function fakeClient({connection=null,usedToday=0}={}){
  const inserted=[];
  const query=(table)=>{const q={filters:[]};const result=()=>{
    if(table==='chat_connections')return {data:connection,error:null};
    if(table==='chat_messages'&&q.head)return {count:usedToday,error:null};
    return {data:[],error:null};};
    Object.assign(q,{select:(_c,o)=>{if(o?.head)q.head=true;return q},eq:()=>q,in:()=>q,gte:()=>q,order:()=>q,limit:()=>q,
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
  await assert.rejects(handleChat({action:'chat-send',message:'Hi',request_id:crypto.randomUUID()},{client,userId:'u',included:includedAI('house')}),/sent 60 messages to Xeyo AI in the last 24 hours/);
});

// The included AI is metered by real cost: Free on Haiku up to $1, Pro on Sonnet up to $2.50 then Haiku, never past $3.
test('AI cost is counted in micro-dollars from the answer’s token usage', () => {
  assert.equal(aiCostMicros('claude-haiku-5-5',{input_tokens:10000,output_tokens:2000}),2000);          // $0.002
  assert.equal(aiCostMicros('claude-sonnet-5-5',{input_tokens:10000,output_tokens:2000}),40000);        // $0.04
  assert.equal(aiCostMicros('claude-haiku-5-5',{input_tokens:200000,output_tokens:1000}),102500);      // long-prompt rate card
  assert.equal(aiCostMicros('claude-haiku-5-5',{input_tokens:1000,cache_read_input_tokens:10000,cache_creation_input_tokens:1000,output_tokens:0}),325);
  assert.equal(aiCostMicros('gpt-4.1-mini',{input_tokens:1000}),0);
  assert.equal(aiCostMicros('claude-haiku-5-5',null),0);
});
test('the allowance picks the model by plan and spend', () => {
  const now=Date.parse('2026-11-04T12:00:00Z');
  assert.deepEqual(aiAllowance({pro:false},250000,now),{tier:'free',model:'claude-haiku-5-5',modelName:'Everyday AI',percent:25,left:750000,daily:60,resets:'2026-12-01'});
  assert.equal(aiAllowance({pro:true},0,now).model,'claude-sonnet-5-5');
  assert.equal(aiAllowance({pro:true},AI_PLAN.pro.premiumUntil,now).model,'claude-haiku-5-5');
  assert.equal(aiAllowance({pro:true},AI_PLAN.pro.budget+5,now).left,0);
  assert.equal(aiAllowance({pro:false},AI_PLAN.free.budget*2,now).percent,100);
});
function spendClient(spent){
  const added=[];
  const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:spent==null?null:{used:spent},error:null})};
  return {client:{from:()=>q,rpc:async(name,args)=>{added.push({name,args});return {data:1,error:null}}},added};
}
test('meteredAI gives Free Haiku, records each answer’s cost, and refuses past the allowance', async () => {
  const {client,added}=spendClient(null);
  const ai=await meteredAI(client,'u','house',{plan:{pro:false},now:Date.parse('2026-11-04T12:00:00Z')});
  assert.equal(ai.model,'claude-haiku-5-5');assert.equal(ai.key,'house');
  await ai.onUsage({input_tokens:10000,output_tokens:2000},'claude-haiku-5-5');
  assert.deepEqual(added,[{name:'add_feature_use',args:{owner:'u',p_feature:'ai_spend',p_period:'2026-11',amount:2000}}]);
  assert.equal(await meteredAI(client,'u','',{plan:{pro:false}}),null);
  const full=spendClient(AI_PLAN.free.budget);
  await assert.rejects(meteredAI(full.client,'u','house',{plan:{pro:false}}),e=>e.status===402&&e.code==='quota'&&e.feature==='smart_ai'&&e.pro===false&&/frontier AI model/.test(e.message)&&!/Sonnet|Haiku/.test(e.message));
  const pro=spendClient(AI_PLAN.free.budget);
  assert.equal((await meteredAI(pro.client,'u','house',{plan:{pro:true}})).model,'claude-sonnet-5-5');
  await assert.rejects(meteredAI(spendClient(AI_PLAN.pro.budget).client,'u','house',{plan:{pro:true}}),e=>e.pro===true&&/resets on/.test(e.message));
});
test('chat-send reports usage to the meter, and a member with their own key never touches it', async (t) => {
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({stop_reason:'end_turn',content:[{type:'text',text:'Ok.'}],usage:{input_tokens:4000,output_tokens:600}}),{status:200}));
  const seen=[];const {client}=fakeClient();
  const included=async()=>({provider:'anthropic',model:'claude-sonnet-5-5',key:'house',included:true,daily:200,onUsage:async(u,m)=>seen.push([m,u.output_tokens])});
  await handleChat({action:'chat-send',message:'Hi',request_id:crypto.randomUUID()},{client,userId:'u',included});
  assert.deepEqual(seen,[['claude-sonnet-5-5',600]]);
  let called=false;const own=fakeClient({connection:{provider:'anthropic',model:'claude-opus-5-5',encrypted_key:'x'}});
  await handleChat({action:'chat-send',message:'Hi',request_id:crypto.randomUUID()},{client:own.client,userId:'u',unseal:async()=>({key:'mine-key-1234567890'}),included:async()=>{called=true;throw Object.assign(Error('quota'),{code:'quota'})}});
  assert.equal(called,false);
});
