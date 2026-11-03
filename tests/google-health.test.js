import test from 'node:test';
import assert from 'node:assert/strict';
import {googleAuthUrl,googleIdentity,collectGoogleHealth,mapGoogleHealth,GOOGLE_HEALTH_SCOPES} from '../supabase/functions/health-api/googlehealth.mjs';
import {createSyncController} from '../src/sync.js';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const d=(y,m,day)=>({year:y,month:m,day});

// Responses shaped like the Google Health API v4 reference.
const sample={
 sleep:{dataPoints:[{name:'users/1/dataTypes/sleep/dataPoints/s1',sleep:{interval:{startTime:'2026-10-30T22:30:00Z',endTime:'2026-10-31T06:30:00Z'},type:'STAGES',metadata:{mainSleep:true,nap:false},summary:{minutesAsleep:'455',stagesSummary:[{type:'LIGHT',minutes:'250'},{type:'DEEP',minutes:'90'},{type:'REM',minutes:'115'},{type:'AWAKE',minutes:'25'}]}}},
  {name:'users/1/dataTypes/sleep/dataPoints/s2',sleep:{interval:{startTime:'2026-10-31T13:00:00Z',endTime:'2026-10-31T13:30:00Z'},metadata:{nap:true},summary:{minutesAsleep:'27'}}}]},
 'daily-resting-heart-rate':{dataPoints:[{dailyRestingHeartRate:{date:d(2026,10,31),beatsPerMinute:'58'}}]},
 'daily-heart-rate-variability':{dataPoints:[{dailyHeartRateVariability:{date:d(2026,10,31),averageHeartRateVariabilityMilliseconds:41.6}}]},
 'daily-oxygen-saturation':{dataPoints:[{dailyOxygenSaturation:{date:d(2026,10,31),averagePercentage:96.4}}]},
 'daily-respiratory-rate':{dataPoints:[{dailyRespiratoryRate:{date:d(2026,10,31),breathsPerMinute:14.2}}]},
 weight:{dataPoints:[{name:'users/1/dataTypes/weight/dataPoints/w1',weight:{sampleTime:{physicalTime:'2026-10-31T07:00:00Z'},weightGrams:72450}}]},
 'body-fat':{dataPoints:[{name:'users/1/dataTypes/body-fat/dataPoints/b1',bodyFat:{sampleTime:{physicalTime:'2026-10-31T07:00:00Z'},percentage:18.5}}]},
 steps:{rollupDataPoints:[{civilStartTime:{date:d(2026,10,31)},steps:{countSum:'8430'}}]},
 'active-energy-burned':{rollupDataPoints:[{civilStartTime:{date:d(2026,10,31)},activeEnergyBurned:{kcalSum:512.4}}]},
};

function fakeGoogle({rejectSnake=false,missing=[]}={}){
 const calls=[];
 const fetcher=async(url,init={})=>{
  calls.push({url:String(url),init});
  const u=new URL(url),type=u.pathname.match(/dataTypes\/([^/:]+)/)?.[1];
  if(init.headers?.Authorization!=='Bearer tok')return json({error:{code:401}},401);
  if(missing.includes(type))return json({error:{code:403,status:'PERMISSION_DENIED'}},403);
  const filter=u.searchParams.get('filter')||'';
  if(rejectSnake&&/^[a-z]+_[a-z_]+\./.test(filter))return json({error:{code:400,status:'INVALID_ARGUMENT'}},400);
  return json(sample[type]||{});
 };
 return {fetcher,calls};
}

test('the Google sign-in link asks for offline read access to sleep, measurements and activity', () => {
 const url=new URL(googleAuthUrl({clientId:'cid',origin:'https://app.xeyo.ai',state:'gh.abc'}));
 assert.equal(url.origin+url.pathname,'https://accounts.google.com/o/oauth2/v2/auth');
 assert.equal(url.searchParams.get('redirect_uri'),'https://app.xeyo.ai/google-callback.html');
 assert.equal(url.searchParams.get('access_type'),'offline');
 assert.deepEqual(url.searchParams.get('scope').split(' '),GOOGLE_HEALTH_SCOPES);
 assert.ok(GOOGLE_HEALTH_SCOPES.every(s=>s.endsWith('.readonly')));
});

test('Fitbit readings land under the same kinds and units as WHOOP and the imports', async () => {
 const {fetcher}=fakeGoogle();
 const rows=mapGoogleHealth('u1',await collectGoogleHealth('tok',{fetcher,now:Date.parse('2026-11-03T10:00:00Z')}));
 const v=k=>rows.filter(r=>r.kind===k).map(r=>r.value);
 assert.deepEqual(v('sleep'),[7.58]);assert.deepEqual(v('nap'),[0.45]);
 assert.deepEqual(v('sleep_deep'),[1.5]);assert.deepEqual(v('sleep_awake'),[25]);
 assert.deepEqual(v('resting_hr'),[58]);assert.deepEqual(v('hrv'),[41.6]);assert.deepEqual(v('spo2'),[96.4]);
 assert.deepEqual(v('respiratory_rate'),[14.2]);assert.deepEqual(v('weight'),[72.45]);assert.deepEqual(v('body_fat'),[18.5]);
 assert.deepEqual(v('steps'),[8430]);assert.deepEqual(v('active_energy'),[512.4]);
 assert.ok(rows.every(r=>r.source==='Fitbit'&&r.user_id==='u1'&&r.external_id.startsWith('gh:')));
 assert.equal(rows.find(r=>r.kind==='resting_hr').observed_at,'2026-10-31T12:00:00.000Z');
 assert.equal(new Set(rows.map(r=>r.kind+'|'+r.external_id)).size,rows.length,'every row has a unique upsert key');
});

test('if Google rejects snake_case filter fields, the camelCase spelling is tried', async () => {
 const {fetcher,calls}=fakeGoogle({rejectSnake:true});
 const data=await collectGoogleHealth('tok',{fetcher});
 assert.equal(data.rhr.length,1);
 assert.ok(calls.some(c=>decodeURIComponent(c.url).includes('dailyRestingHeartRate.date')));
});

test('a data type the member did not share is skipped, the rest still syncs', async () => {
 const {fetcher}=fakeGoogle({missing:['weight','body-fat']});
 const rows=mapGoogleHealth('u1',await collectGoogleHealth('tok',{fetcher}));
 assert.equal(rows.filter(r=>r.kind==='weight').length,0);
 assert.ok(rows.some(r=>r.kind==='sleep'));
});

test('expired Google access asks the member to reconnect', async () => {
 const {fetcher}=fakeGoogle();
 await assert.rejects(collectGoogleHealth('old',{fetcher}),/Reconnect Fitbit/);
});

test('an account without a Google Health profile gets clear instructions', async () => {
 const notLinked=async()=>json({error:{code:400,status:'FAILED_PRECONDITION',details:[{reason:'ACCOUNT_NOT_LINKED'}]}},400);
 await assert.rejects(googleIdentity('tok',notLinked),/no Google Health profile yet/);
 assert.equal((await googleIdentity('tok',async()=>json({healthUserId:'111'}))).healthUserId,'111');
});

test('the sync controller refreshes Fitbit as well as WHOOP', async () => {
 const synced=[];
 const c=createSyncController({loadConnections:async()=>[{provider:'whoop'},{provider:'google_health'},{provider:'apple-import'}],sync:async p=>{synced.push(p);return {imported:1}},reload:async()=>{},onState:()=>{}});
 await c.run();
 assert.deepEqual(synced.sort(),['google_health','whoop']);
});
