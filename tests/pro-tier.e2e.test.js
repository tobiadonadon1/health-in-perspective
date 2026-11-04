// End to end against a real local backend (PostgreSQL 17 + PostgREST + the real health-api edge function under Deno):
// the WHOOP seat cap under concurrent requests, the server-side paywall, a lapsed subscription freeing its seat,
// Stripe webhooks, and the WHOOP disconnect script's dry run and idempotency. Skipped when the tools are missing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {available,startStack} from './local-stack/stack.mjs';
import {createSealer} from '../supabase/functions/health-api/sealing.mjs';
import {signStripePayload} from '../supabase/functions/health-api/billing.mjs';

const run=promisify(execFile);
const skip=!available()&&'needs postgres, postgrest and deno on PATH';
let s;
// A house key that is never used for a real call here: the allowance check refuses before any request leaves.
test.before(async()=>{if(!skip)s=await startStack({env:{XEYO_ANTHROPIC_KEY:'sk-ant-test-never-called'}})});
test.after(async()=>{await s?.stop()});

const q=v=>`'${String(v).replace(/'/g,"''")}'`;
async function makePro(user,{status='active',days=30}={}){await s.psql(`insert into public.subscriptions(stripe_subscription_id,user_id,stripe_customer_id,status,current_period_end) values(${q('sub_'+user.id)},${q(user.id)},${q('cus_'+user.id)},${q(status)},now()+interval '${days} days') on conflict(stripe_subscription_id) do update set status=excluded.status,current_period_end=excluded.current_period_end`)}
async function users(n,prefix){const out=[];for(let i=0;i<n;i++)out.push(await s.createUser(`${prefix}${i}-${Date.now()}@example.test`));return out}
const count=async sql=>Number(await s.psql(sql));
async function resetSeats(){await s.psql('delete from public.whoop_seats; delete from public.wearable_secrets; delete from public.oauth_states')}
async function connectWhoop(u){const c=await s.api(u.token,'whoop-connect');assert.equal(c.status,200,c.error);const state=new URL(c.url).searchParams.get('state');return s.api(u.token,'whoop-complete',{state,code:'code-'+u.id})}

test('15 Pro members asking at once get exactly 10 live WHOOP seats; the other 5 are told seats are full',{skip},async()=>{
 await resetSeats();const crowd=await users(15,'crowd');for(const u of crowd)await makePro(u);
 const replies=await Promise.all(crowd.map(u=>s.api(u.token,'whoop-connect')));
 const won=replies.filter(r=>r.status===200&&r.url),full=replies.filter(r=>r.status===409);
 assert.equal(won.length,10);assert.equal(full.length,5);
 assert.ok(full.every(r=>r.code==='seats_full'&&r.seats.left===0&&/seats are full/i.test(r.error)));
 assert.equal(await count('select count(*) from public.whoop_seats'),10);
 // Asking again keeps your own seat instead of taking a second one.
 const again=await s.api(crowd[replies.indexOf(won[0])].token,'whoop-connect');assert.equal(again.status,200);
 assert.equal(await count('select count(*) from public.whoop_seats'),10);
});

test('two members racing for the last seat: exactly one wins, every time (40 rounds, real concurrent transactions)',{skip},async()=>{
 const pool=await users(11,'race');for(const u of pool)await makePro(u);
 for(let round=0;round<40;round++){
  await s.psql('delete from public.whoop_seats');
  await s.psql(`insert into public.whoop_seats(user_id,status) select unnest(array[${pool.slice(0,9).map(u=>q(u.id)+'::uuid').join(',')}]),'active'`);
  const [a,b]=[pool[9],pool[10]],psql=u=>run('psql',[...s.psqlArgs,'-c',`select (public.claim_whoop_seat(${q(u.id)},10,true))->>'ok'`]).then(r=>r.stdout.trim());
  const results=await Promise.all([psql(a),psql(b)]);
  assert.deepEqual(results.sort(),['false','true'],'round '+round);
  assert.equal(await count('select count(*) from public.whoop_seats'),10);
 }
});

test('WHOOP_SEAT_CAP is honoured: raising it opens new seats without code changes',{skip},async()=>{
 await s.psql('delete from public.whoop_seats');
 const [u]=await users(1,'cap');await makePro(u);
 await s.psql(`insert into public.whoop_seats(user_id,status) select id,'active' from auth.users where id<>${q(u.id)} limit 10`);
 assert.equal((await s.psql(`select (public.claim_whoop_seat(${q(u.id)},10))->>'reason'`)),'full');
 assert.equal((await s.psql(`select (public.claim_whoop_seat(${q(u.id)},100))->>'ok'`)),'true');
});

test('the paywall is enforced on the server for every Pro endpoint, whatever the app shows',{skip},async()=>{
 await resetSeats();const [free]=await users(1,'free');
 for(const action of ['whoop-connect','whoop-complete','export-csv']){
  const r=await s.api(free.token,action,{state:'x',code:'y'});
  assert.equal(r.status,402,action);assert.equal(r.code,'pro_required');assert.ok(r.feature,action);
 }
 // A free member who somehow still has WHOOP tokens is disconnected on sync rather than synced.
 assert.equal(await count('select count(*) from public.whoop_seats'),0);
 const status=await s.api(free.token,'connections');
 assert.equal(status.plan.pro,false);assert.deepEqual(status.limits,{historyDays:30});assert.equal(status.usage.ai.tier,'free');assert.equal(status.usage.ai.percent,0);assert.equal(status.seats.cap,10);
});

test('Free members see 30 days of wearable history (RLS); Pro sees everything; everyone can export all of it',{skip},async()=>{
 const [m]=await users(1,'history');
 await s.psql(`insert into public.health_readings(user_id,kind,value,unit,source,external_id,observed_at) values
  (${q(m.id)},'hrv',50,'ms','WHOOP','r1',now()-interval '3 days'),(${q(m.id)},'hrv',44,'ms','WHOOP','r2',now()-interval '60 days'),
  (${q(m.id)},'hrv',47,'ms','WHOOP','r3',now()-interval '400 days'),(${q(m.id)},'weight',70,'kg','Manual entry','w1',now()-interval '200 days')`);
 const free=await s.rest(m.token,'health_readings?select=external_id&order=external_id');
 assert.deepEqual(free.body.map(r=>r.external_id),['r1','w1']);
 const all=await s.api(m.token,'export-readings');assert.equal(all.rows.length,4,'the right of access covers the whole history');
 await makePro(m);
 const pro=await s.rest(m.token,'health_readings?select=external_id&order=external_id');
 assert.deepEqual(pro.body.map(r=>r.external_id),['r1','r2','r3','w1']);
 const csv=await s.api(m.token,'export-csv');assert.equal(csv.status,200);assert.equal(csv.rows,4);assert.match(csv.csv,/^observed_at,kind,value,unit,source\r\n/);
 // Another member can never read these rows.
 const [other]=await users(1,'other');await makePro(other);
 assert.deepEqual((await s.rest(other.token,'health_readings?select=id')).body,[]);
});

test('AI allowance: spend adds up atomically; Free past $1 gets the upgrade 402, Pro gets Sonnet; Free sees hidden history counts',{skip},async()=>{
 const [m]=await users(1,'ai');
 const add=n=>s.psql(`select public.add_feature_use(${q(m.id)},'ai_spend','2026-11',${n})`);
 await Promise.all([add(1000),add(2000),add(3000),add(-50)]);
 assert.equal(await count(`select used from public.feature_usage where user_id=${q(m.id)} and feature='ai_spend'`),6000);
 // Members cannot add spend themselves.
 assert.notEqual((await s.rest(m.token,'rpc/add_feature_use',{method:'POST',body:JSON.stringify({owner:m.id,p_feature:'ai_spend',p_period:'2026-11',amount:6000})})).status,200);
 const [n]=await users(1,'ai2');
 await s.psql(`insert into public.feature_usage(user_id,feature,period,used) values(${q(n.id)},'ai_spend',to_char(now(),'YYYY-MM'),1000000)`);
 const out=await s.api(n.token,'chat-send',{message:'One more?',request_id:crypto.randomUUID()});
 assert.equal(out.status,402);assert.equal(out.code,'quota');assert.equal(out.feature,'smart_ai');
 const status=await s.api(n.token,'plan-status');assert.equal(status.usage.ai.percent,100);
 await makePro(n);
 const proStatus=await s.api(n.token,'plan-status');assert.equal(proStatus.usage.ai.model,'claude-sonnet-5-5');assert.equal(proStatus.usage.ai.percent,33);assert.equal(proStatus.hidden,null);
 const [h]=await users(1,'hidden');
 await s.psql(`insert into public.health_readings(user_id,kind,value,unit,source,external_id,observed_at) values(${q(h.id)},'hrv',50,'ms','WHOOP','a',now()-interval '90 days'),(${q(h.id)},'hrv',52,'ms','WHOOP','b',now()-interval '60 days'),(${q(h.id)},'hrv',55,'ms','WHOOP','c',now()-interval '2 days'),(${q(h.id)},'weight',70,'kg','Manual entry','d',now()-interval '200 days')`);
 const hidden=(await s.api(h.token,'plan-status')).hidden;
 assert.equal(hidden.readings,2);assert.equal(hidden.since,new Date(Date.now()-90*86400000).toISOString().slice(0,10));
});

test('Stripe checkout makes a member Pro; a cancelled subscription disconnects WHOOP, frees the seat and keeps the data',{skip},async()=>{
 await resetSeats();const [m]=await users(1,'stripe');
 const sub={id:'sub_live_'+m.id.slice(0,8),customer:'cus_x'+m.id.slice(0,6),status:'active',cancel_at_period_end:false,items:{data:[{price:{id:'price_eur5',product:'prod_VYwqqND3EY7S3r'},current_period_end:Math.floor(Date.now()/1000)+30*86400}]}};
 s.stripeSubs.set(sub.id,sub);
 const hook=async event=>{const raw=JSON.stringify(event);return fetch(s.url+'/functions/v1/health-api?hook=stripe',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':await signStripePayload(raw,s.env.STRIPE_WEBHOOK_SECRET)},body:raw}).then(r=>r.json().then(j=>({status:r.status,...j})))};
 const forged=await fetch(s.url+'/functions/v1/health-api?hook=stripe',{method:'POST',headers:{'Stripe-Signature':'t=1,v1=00'},body:'{}'});
 assert.equal(forged.status,400);
 const done=await hook({type:'checkout.session.completed',data:{object:{mode:'subscription',subscription:sub.id,customer:sub.customer,client_reference_id:m.id,customer_details:{email:m.email}}}});
 assert.equal(done.status,200,done.error);
 assert.equal((await s.api(m.token,'connections')).plan.pro,true);
 const linked=await connectWhoop(m);assert.ok(['connected','connected-needs-sync'].includes(linked.status),JSON.stringify(linked));
 assert.equal(await s.psql(`select status from public.whoop_seats where user_id=${q(m.id)}`),'active');
 await s.psql(`insert into public.health_readings(user_id,kind,value,unit,source,external_id,observed_at) values(${q(m.id)},'recovery',70,'%','WHOOP','c1',now())`);
 const revokesBefore=s.calls.whoop.filter(c=>c.method==='DELETE').length;
 sub.status='canceled';
 const gone=await hook({type:'customer.subscription.deleted',data:{object:sub}});
 assert.equal(gone.status,200,gone.error);assert.equal(gone.lapsed,1);
 assert.equal(await count(`select count(*) from public.whoop_seats where user_id=${q(m.id)}`),0,'seat freed');
 assert.equal(await count(`select count(*) from public.wearable_secrets where user_id=${q(m.id)}`),0,'tokens deleted');
 assert.equal(await count(`select count(*) from public.health_readings where user_id=${q(m.id)}`),1,'data kept');
 assert.equal(s.calls.whoop.filter(c=>c.method==='DELETE').length,revokesBefore+1,'revoked at WHOOP');
 assert.deepEqual((await s.api(m.token,'connections')).notices,['pro_lapsed']);
});

test('a subscription that ran out without a webhook is caught on the next sync and by the maintenance sweep',{skip},async()=>{
 await resetSeats();const [a,b]=await users(2,'expired');for(const u of [a,b]){await makePro(u);await connectWhoop(u)}
 await s.psql(`update public.subscriptions set current_period_end=now()-interval '10 days' where user_id in (${q(a.id)},${q(b.id)})`);
 const sync=await s.api(a.token,'whoop-sync');assert.equal(sync.disconnected,true);assert.equal(sync.reason,'pro_lapsed');
 const sweep=await fetch(s.url+'/functions/v1/health-api',{method:'POST',headers:{'x-xeyo-admin':s.env.ADMIN_TASK_SECRET},body:JSON.stringify({action:'pro-maintenance'})}).then(r=>r.json());
 assert.equal(sweep.lapsed.length,1);assert.equal(await count('select count(*) from public.whoop_seats'),0);
 const denied=await fetch(s.url+'/functions/v1/health-api',{method:'POST',headers:{'x-xeyo-admin':'wrong'},body:'{}'});assert.equal(denied.status,403);
});

test('the WHOOP disconnect script: dry run changes nothing; apply disconnects everyone, keeps data; a second run is a no-op',{skip},async()=>{
 await resetSeats();await s.psql('delete from public.account_notices');
 const sealer=createSealer(s.env.TOKEN_ENCRYPTION_KEY),members=await users(3,'migrate');
 for(const [i,u] of members.entries()){
  const tokens=await sealer.seal({access_token:'a'+i,refresh_token:'r'+i,expires_at:Date.now()+(i===2?-1000:3600000)});
  await s.psql(`insert into public.wearable_secrets(user_id,provider,encrypted_tokens,updated_at) values(${q(u.id)},'whoop',${q(tokens)},now()-interval '${i+1} days')`);
  await s.psql(`insert into public.health_readings(user_id,kind,value,unit,source,external_id,observed_at) values(${q(u.id)},'hrv',40,'ms','WHOOP','m${i}',now())`);
 }
 const env={...process.env,SUPABASE_URL:s.url,SUPABASE_SERVICE_ROLE_KEY:s.serviceKey};
 const snapshot=()=>s.psql("select (select count(*) from public.wearable_secrets)||'/'||(select count(*) from public.account_notices)||'/'||(select count(*) from public.health_readings)");
 const before=await snapshot();
 const dry=await run('node',['scripts/disconnect-whoop.mjs'],{env});
 assert.match(dry.stdout,/DRY RUN · live WHOOP connections found: 3/);for(const u of members)assert.ok(dry.stdout.includes(u.email));
 assert.equal(await snapshot(),before,'the dry run writes nothing');
 const applyEnv={...env,TOKEN_ENCRYPTION_KEY:s.env.TOKEN_ENCRYPTION_KEY,WHOOP_CLIENT_ID:'c',WHOOP_CLIENT_SECRET:'s',WHOOP_API_BASE:s.env.WHOOP_API_BASE};
 const deletes=s.calls.whoop.filter(c=>c.method==='DELETE').length,refreshes=s.calls.whoop.filter(c=>c.path.endsWith('/token')).length;
 const applied=await run('node',['scripts/disconnect-whoop.mjs','--apply'],{env:applyEnv});
 assert.equal((applied.stdout.match(/✓/g)||[]).length,3,applied.stdout);
 assert.equal(s.calls.whoop.filter(c=>c.method==='DELETE').length,deletes+3,'every grant revoked at WHOOP');
 assert.equal(s.calls.whoop.filter(c=>c.path.endsWith('/token')).length,refreshes+1,'the expired token was refreshed before revoking');
 assert.equal(await count("select count(*) from public.wearable_secrets where provider='whoop'"),0);
 assert.equal(await count("select count(*) from public.account_notices where kind='whoop_live_now_pro'"),3);
 assert.equal(await count(`select count(*) from public.health_readings where external_id like 'm%' and source='WHOOP'`),3,'readings kept');
 const again=await run('node',['scripts/disconnect-whoop.mjs','--apply'],{env:applyEnv});
 assert.match(again.stdout,/found: 0/);
 assert.equal(await count("select count(*) from public.account_notices where kind='whoop_live_now_pro'"),3,'notices are written once');
 // The member sees the notice once, then dismisses it.
 const notice=await s.api(members[0].token,'connections');assert.deepEqual(notice.notices,['whoop_live_now_pro']);
 await s.api(members[0].token,'notice-dismiss',{kind:'whoop_live_now_pro'});
 assert.deepEqual((await s.api(members[0].token,'connections')).notices,[]);
});

test('the disconnect can also run inside the deployed API (where the encryption key lives), dry run first',{skip},async()=>{
 await resetSeats();const [u]=await users(1,'viafn');const sealer=createSealer(s.env.TOKEN_ENCRYPTION_KEY);
 await s.psql(`insert into public.wearable_secrets(user_id,provider,encrypted_tokens) values(${q(u.id)},'whoop',${q(await sealer.seal({access_token:'z',refresh_token:'y',expires_at:Date.now()+3600000}))})`);
 const call=body=>fetch(s.url+'/functions/v1/health-api',{method:'POST',headers:{'x-xeyo-admin':s.env.ADMIN_TASK_SECRET},body:JSON.stringify(body)}).then(r=>r.json());
 const dry=await call({action:'admin-whoop-disconnect'});assert.equal(dry.dryRun,true);assert.equal(dry.affected.length,1);
 assert.equal(await count('select count(*) from public.wearable_secrets'),1);
 const done=await call({action:'admin-whoop-disconnect',dryRun:false});assert.equal(done.results[0].ok,true);assert.equal(done.results[0].revoked,true);
 assert.equal(await count('select count(*) from public.wearable_secrets'),0);
});
