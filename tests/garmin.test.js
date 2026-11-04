import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {GARMIN_STATE_PREFIX,GARMIN_TOKEN_URL,garminRedirect,createPkce,pkceChallenge,garminPkceForState,garminAuthUrl,garminToken,garminUserId,garminPermissions,garminDeregister,requestGarminBackfill,mapGarmin,handleGarminPush,garminHookAuthorized,garminCallbackAllowed} from '../supabase/functions/health-api/garmin.mjs';

const json=(body,status=200)=>new Response(body===null?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const ts=s=>Date.parse(s)/1000;
const NOW=Date.parse('2026-11-03T10:00:00Z');
const G='4aacafe82427c251df9c9592d0c06768';

// Summaries shaped like Garmin Health API / Activity API push notifications (field names from the Health API spec as used by
// the open-source clients cited in garmin.mjs). The member is in Central European Time (offset 3600 s).
const daily={userId:G,userAccessToken:'uat',summaryId:'x153a9f3-6a04d1a0',calendarDate:'2026-10-31',activityType:'WALKING',activeKilocalories:612,bmrKilocalories:1720,consumedCalories:0,steps:10432,distanceInMeters:7820.4,durationInSeconds:86400,activeTimeInSeconds:5400,startTimeInSeconds:ts('2026-10-30T23:00:00Z'),startTimeOffsetInSeconds:3600,moderateIntensityDurationInSeconds:1800,vigorousIntensityDurationInSeconds:600,floorsClimbed:8,minHeartRateInBeatsPerMinute:48,averageHeartRateInBeatsPerMinute:66,maxHeartRateInBeatsPerMinute:151,restingHeartRateInBeatsPerMinute:52,timeOffsetHeartRateSamples:{'15':60,'30':61},averageStressLevel:31,maxStressLevel:88,stressDurationInSeconds:14000,bodyBatteryChargedValue:62,bodyBatteryDrainedValue:58};
const sleepStart=ts('2026-10-30T22:10:00Z');
const sleep={userId:G,userAccessToken:'uat',summaryId:'x153a9f3-6a04c3b8',calendarDate:'2026-10-31',durationInSeconds:27000,startTimeInSeconds:sleepStart,startTimeOffsetInSeconds:3600,unmeasurableSleepInSeconds:0,deepSleepDurationInSeconds:5400,lightSleepDurationInSeconds:14400,remSleepInSeconds:6300,awakeDurationInSeconds:900,validation:'ENHANCED_FINAL',
 sleepLevelsMap:{deep:[{startTimeInSeconds:sleepStart+600,endTimeInSeconds:sleepStart+6000}],light:[{startTimeInSeconds:sleepStart,endTimeInSeconds:sleepStart+600}],rem:[{startTimeInSeconds:sleepStart+20000,endTimeInSeconds:sleepStart+27000}]},overallSleepScore:{value:84,qualifierKey:'GOOD'},
 naps:[{napStartTimeInSeconds:ts('2026-10-31T13:00:00Z'),napOffsetInSeconds:3600,napDurationInSeconds:1620,napValidation:'DEVICE'}]};
const hrv={userId:G,summaryId:'x153a9f3-6a04c3b8',calendarDate:'2026-10-31',lastNightAvg:44,lastNight5MinHigh:72,startTimeOffsetInSeconds:3600,durationInSeconds:27000,startTimeInSeconds:sleepStart,hrvValues:{'300':32,'600':38}};
const bodyComp={userId:G,summaryId:'x153a9f3-6a05e2d8',measurementTimeInSeconds:ts('2026-10-31T06:30:00Z'),measurementTimeOffsetInSeconds:3600,muscleMassInGrams:32000,boneMassInGrams:3100,bodyWaterInPercent:56.4,bodyFatInPercent:18.6,bodyMassIndex:22.9,weightInGrams:72450};
const pulseOx={userId:G,summaryId:'x153a9f3-6a04c3b8',calendarDate:'2026-10-31',startTimeInSeconds:sleepStart,durationInSeconds:27000,startTimeOffsetInSeconds:3600,timeOffsetSpo2Values:{'0':95,'60':96,'120':97,'180':96},onDemand:false};
const respiration={userId:G,summaryId:'x153a9f3-6a04c3b8',startTimeInSeconds:sleepStart,durationInSeconds:900,startTimeOffsetInSeconds:3600,timeOffsetEpochToBreaths:{'0':14.63,'60':14.4,'120':14.19,'180':14.38}};
const activity={userId:G,userAccessToken:'uat',summaryId:'10293845761',activityId:10293845761,activityName:'Morning Run',activityType:'RUNNING',durationInSeconds:2730,startTimeInSeconds:ts('2026-10-31T07:15:00Z'),startTimeOffsetInSeconds:3600,averageHeartRateInBeatsPerMinute:152,averageRunCadenceInStepsPerMinute:166,averageSpeedInMetersPerSecond:3.05,averagePaceInMinutesPerKilometer:5.46,activeKilocalories:598,deviceName:'forerunner965',distanceInMeters:8326.5,maxHeartRateInBeatsPerMinute:178,steps:7550,totalElevationGainInMeters:41};
const push={dailies:[daily],sleeps:[sleep],hrv:[hrv],bodyComps:[bodyComp],pulseox:[pulseOx],allDayRespiration:[respiration],activities:[activity],
 epochs:[{userId:G,summaryId:'x-epoch',activityType:'WALKING',activeKilocalories:4,steps:120,startTimeInSeconds:sleepStart,durationInSeconds:900}],
 stressDetails:[{userId:G,summaryId:'x-stress',startTimeInSeconds:sleepStart,durationInSeconds:86400,timeOffsetStressLevelValues:{'0':25,'180':-1}}]};
const users={[G]:'u1','g2':'u2'};
const lookupUser=async id=>users[id]||null;
const value=(rows,kind)=>rows.filter(r=>r.kind===kind).map(r=>r.value);

test('PKCE: the challenge is the base64url SHA-256 of the verifier (RFC 7636 vector and random pairs)', async () => {
 assert.equal(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
 const {verifier,challenge}=await createPkce();
 assert.match(verifier,/^[A-Za-z0-9\-._~]{43,128}$/);
 assert.equal(challenge,createHash('sha256').update(verifier).digest('base64url'));
 assert.notEqual((await createPkce()).verifier,verifier);
});

test('PKCE derived from the state is stable, secret-bound and valid for Garmin', async () => {
 const a=await garminPkceForState('gm.abc','secret-1'),b=await garminPkceForState('gm.abc','secret-1');
 assert.deepEqual(a,b);
 assert.match(a.verifier,/^[A-Za-z0-9\-_]{43,128}$/);
 assert.equal(a.challenge,createHash('sha256').update(a.verifier).digest('base64url'));
 assert.notEqual((await garminPkceForState('gm.abd','secret-1')).verifier,a.verifier);
 assert.notEqual((await garminPkceForState('gm.abc','secret-2')).verifier,a.verifier);
 await assert.rejects(garminPkceForState('gm.abc',''),/not configured/);
});

test('the Garmin sign-in link carries the PKCE challenge, state and callback page', async () => {
 const {challenge}=await createPkce();
 const url=new URL(garminAuthUrl({clientId:'ck',origin:'https://app.xeyo.ai',state:GARMIN_STATE_PREFIX+'xyz',challenge}));
 assert.equal(url.origin+url.pathname,'https://connect.garmin.com/oauth2Confirm');
 assert.deepEqual(Object.fromEntries(url.searchParams),{response_type:'code',client_id:'ck',code_challenge:challenge,code_challenge_method:'S256',redirect_uri:'https://app.xeyo.ai/garmin-callback.html',state:'gm.xyz'});
 assert.equal(garminRedirect('http://localhost:3001'),'http://localhost:3001/garmin-callback.html');
 assert.throws(()=>garminAuthUrl({clientId:'',origin:'https://app.xeyo.ai',state:'gm.x',challenge}),/not configured/);
});

test('token exchange sends the verifier and secret as a form, and stores an early expires_at', async () => {
 const calls=[];
 const fetcher=async(url,init)=>{calls.push({url,init,form:Object.fromEntries(new URLSearchParams(init.body))});return json({access_token:'at',expires_in:86400,token_type:'bearer',refresh_token:'rt',scope:'PARTNER_WRITE PARTNER_READ CONNECT_READ CONNECT_WRITE',jti:'j',refresh_token_expires_in:7775998})};
 const before=Date.now();
 const t=await garminToken({grant_type:'authorization_code',code:'c0de',code_verifier:'v'.repeat(43),redirect_uri:'https://app.xeyo.ai/garmin-callback.html'},{clientId:'ck',clientSecret:'cs'},fetcher);
 assert.equal(calls[0].url,GARMIN_TOKEN_URL);assert.equal(calls[0].init.method,'POST');
 assert.equal(calls[0].init.headers['Content-Type'],'application/x-www-form-urlencoded');
 assert.deepEqual(calls[0].form,{grant_type:'authorization_code',code:'c0de',code_verifier:'v'.repeat(43),redirect_uri:'https://app.xeyo.ai/garmin-callback.html',client_id:'ck',client_secret:'cs'});
 assert.equal(t.access_token,'at');assert.equal(t.refresh_token,'rt');
 assert.ok(t.expires_at>=before+(86400-600)*1000&&t.expires_at<=Date.now()+(86400-600)*1000);
 assert.ok(t.refresh_token_expires_at>=before+7775998*1000);
});

test('token failures say to reconnect Garmin', async () => {
 const creds={clientId:'ck',clientSecret:'cs'};
 await assert.rejects(garminToken({grant_type:'refresh_token',refresh_token:'old'},creds,async()=>json({error:'invalid_grant',error_description:'Invalid refresh token'},400)),/expired or was revoked\. Reconnect Garmin/);
 await assert.rejects(garminToken({grant_type:'refresh_token',refresh_token:'old'},creds,async()=>json({},401)),/expired or was revoked\. Reconnect Garmin/);
 await assert.rejects(garminToken({grant_type:'authorization_code',code:'x'},creds,async()=>json({error:'server_error'},500)),/authorization failed\. Reconnect Garmin/);
 await assert.rejects(garminToken({grant_type:'authorization_code',code:'x'},creds,async()=>json({token_type:'bearer'})),/Reconnect Garmin/);
 await assert.rejects(garminToken({grant_type:'authorization_code',code:'x'},creds,async()=>{throw TypeError('network')}),/did not respond/);
 await assert.rejects(garminToken({grant_type:'authorization_code',code:'x'},{clientId:'',clientSecret:''},async()=>json({})),/not configured/);
});

test('user id, permissions and deregistration use the Wellness API with the bearer token', async () => {
 const calls=[];
 const fetcher=async(url,init={})=>{calls.push({url:String(url),method:init.method||'GET',auth:init.headers?.Authorization});
  if(init.headers?.Authorization!=='Bearer at')return json({errorMessage:'token is not active'},401);
  if(String(url).endsWith('/user/id'))return json({userId:G});
  if(String(url).endsWith('/user/permissions'))return json(['ACTIVITY_EXPORT','HEALTH_EXPORT','WORKOUT_IMPORT']);
  if(String(url).endsWith('/user/registration')&&init.method==='DELETE')return new Response(null,{status:204});
  return json({},404)};
 assert.equal(await garminUserId('at',fetcher),G);
 assert.deepEqual(await garminPermissions('at',fetcher),['ACTIVITY_EXPORT','HEALTH_EXPORT','WORKOUT_IMPORT']);
 assert.equal(await garminDeregister('at',fetcher),true);
 assert.deepEqual(calls.map(c=>c.method+' '+c.url),['GET https://apis.garmin.com/wellness-api/rest/user/id','GET https://apis.garmin.com/wellness-api/rest/user/permissions','DELETE https://apis.garmin.com/wellness-api/rest/user/registration']);
 await assert.rejects(garminUserId('old',fetcher),/Reconnect Garmin/);
 await assert.rejects(garminPermissions('old',fetcher),/Reconnect Garmin/);
 assert.equal(await garminDeregister('old',fetcher),false);
 assert.equal(await garminDeregister('at',async()=>{throw TypeError('offline')}),false);
 assert.deepEqual(await garminPermissions('at',async()=>json({permissions:['health_export']})),['HEALTH_EXPORT']);
 await assert.rejects(garminPermissions('at',async()=>json({unexpected:true})),/did not return/);
 await assert.rejects(garminUserId('at',async()=>json({userId:''})),/did not confirm/);
});

test('backfill asks for each summary type in windows of at most 30 days and reports the outcome', async () => {
 const calls=[];
 const status={dailies:202,sleeps:409,hrv:403,bodyComps:412,pulseOx:500,respiration:202,activities:202};
 const fetcher=async(url,init={})=>{const u=new URL(url);calls.push(u);return new Response(null,{status:status[u.pathname.split('/').pop()]||404})};
 const r=await requestGarminBackfill('at',{days:45,now:NOW,fetcher});
 assert.deepEqual(r,{requested:['dailies','allDayRespiration','activities'],duplicate:['sleeps'],denied:['hrv','bodyComps'],failed:['pulseox']});
 assert.equal(calls.length,14,'two windows for each of seven types');
 for(const u of calls){
  assert.equal(u.origin,'https://apis.garmin.com');assert.match(u.pathname,/^\/wellness-api\/rest\/backfill\/(dailies|sleeps|hrv|bodyComps|pulseOx|respiration|activities)$/);
  const from=Number(u.searchParams.get('summaryStartTimeInSeconds')),to=Number(u.searchParams.get('summaryEndTimeInSeconds'));
  assert.ok(to>from&&to-from<=30*86400);assert.ok(to<=NOW/1000&&from>=NOW/1000-45*86400);
 }
 await assert.rejects(requestGarminBackfill('old',{fetcher:async()=>json({},401)}),/Reconnect Garmin/);
});

test('every Garmin summary type lands under the same kinds and units as WHOOP, Fitbit and the imports', () => {
 const rows=mapGarmin('u1',push,{now:NOW});
 assert.deepEqual(value(rows,'steps'),[10432]);assert.deepEqual(value(rows,'active_energy'),[612]);assert.deepEqual(value(rows,'energy_burned'),[2332]);
 assert.deepEqual(value(rows,'resting_hr'),[52]);assert.deepEqual(value(rows,'heart_rate'),[66]);
 assert.deepEqual(value(rows,'sleep'),[7.25]);assert.deepEqual(value(rows,'sleep_deep'),[1.5]);assert.deepEqual(value(rows,'sleep_light'),[4]);
 assert.deepEqual(value(rows,'sleep_rem'),[1.75]);assert.deepEqual(value(rows,'sleep_awake'),[15]);assert.deepEqual(value(rows,'nap'),[0.45]);
 assert.deepEqual(value(rows,'hrv'),[44]);assert.deepEqual(value(rows,'weight'),[72.45]);assert.deepEqual(value(rows,'body_fat'),[18.6]);
 assert.deepEqual(value(rows,'spo2'),[96]);assert.deepEqual(value(rows,'respiratory_rate'),[14.4]);
 assert.deepEqual(value(rows,'workout'),[45.5]);assert.deepEqual(value(rows,'workout_energy'),[598]);assert.deepEqual(value(rows,'workout_avg_hr'),[152]);assert.deepEqual(value(rows,'workout_max_hr'),[178]);
 const unit=Object.fromEntries(rows.map(r=>[r.kind,r.unit]));
 assert.deepEqual(unit,{steps:'',active_energy:'kcal',energy_burned:'kcal',resting_hr:'bpm',heart_rate:'bpm',sleep:'hours',sleep_deep:'hours',sleep_light:'hours',sleep_rem:'hours',sleep_awake:'min',nap:'hours',hrv:'ms',weight:'kg',body_fat:'%',spo2:'%',respiratory_rate:'breaths/min',workout:'min',workout_energy:'kcal',workout_avg_hr:'bpm',workout_max_hr:'bpm'});
 const at=k=>rows.find(r=>r.kind===k).observed_at;
 assert.equal(at('steps'),'2026-10-31T12:00:00.000Z');assert.equal(at('hrv'),'2026-10-31T12:00:00.000Z');
 assert.equal(at('sleep'),'2026-10-31T05:40:00.000Z','sleep is dated at wake-up');
 assert.equal(at('workout'),'2026-10-31T07:15:00.000Z','a workout is dated at its start');
 assert.equal(at('weight'),'2026-10-31T06:30:00.000Z');
 assert.ok(rows.every(r=>r.user_id==='u1'&&r.source==='Garmin'&&r.external_id.startsWith('gm:'+r.kind+':')));
 assert.equal(rows.find(r=>r.kind==='steps').external_id,'gm:steps:2026-10-31');
 assert.equal(rows.find(r=>r.kind==='workout').external_id,'gm:workout:10293845761');
 assert.equal(new Set(rows.map(r=>r.kind+'|'+r.external_id)).size,rows.length,'every row has a unique upsert key');
});

test('sleep without stages (entered by hand) uses its duration; the day comes from the local start when calendarDate is missing', () => {
 const rows=mapGarmin('u1',{sleeps:[{userId:G,summaryId:'m1',durationInSeconds:25200,startTimeInSeconds:ts('2026-10-31T23:30:00Z'),startTimeOffsetInSeconds:3600,validation:'MANUAL'}]},{now:NOW});
 assert.deepEqual(value(rows,'sleep'),[7]);assert.equal(value(rows,'sleep_deep').length,0);
 assert.equal(rows[0].external_id,'gm:sleep:2026-11-01');
});

test('re-pushes are idempotent and a growing day keeps its most complete copy', () => {
 const a=mapGarmin('u1',push,{now:NOW}),b=mapGarmin('u1',structuredClone(push),{now:NOW});
 assert.deepEqual(a.map(r=>r.kind+'|'+r.external_id),b.map(r=>r.kind+'|'+r.external_id));
 const morning={...daily,summaryId:'x153a9f3-early',durationInSeconds:30000,steps:2100,activeKilocalories:90};
 const rows=mapGarmin('u1',{dailies:[daily,morning]},{now:NOW});
 assert.deepEqual(value(rows,'steps'),[10432]);
 assert.deepEqual(value(mapGarmin('u1',{dailies:[morning]},{now:NOW}),'steps'),[2100]);
 assert.equal(mapGarmin('u1',{dailies:[morning]},{now:NOW})[0].external_id,rows.find(r=>r.kind==='steps').external_id,'the fuller day replaces the partial one on upsert');
 const edited=mapGarmin('u1',{manuallyUpdatedActivities:[{...activity,summaryId:'10293845761-manual',durationInSeconds:3000}]},{now:NOW});
 assert.equal(edited.find(r=>r.kind==='workout').external_id,'gm:workout:10293845761');assert.deepEqual(value(edited,'workout'),[50]);
});

test('malformed records and impossible values are skipped without throwing', () => {
 const bad={dailies:[null,'x',[],{userId:G,calendarDate:'2026-13-45',steps:100},{userId:G,calendarDate:'2026-10-29',steps:-5,activeKilocalories:'abc',restingHeartRateInBeatsPerMinute:0,averageHeartRateInBeatsPerMinute:Infinity},{userId:G,calendarDate:'2026-10-28',steps:1e9,restingHeartRateInBeatsPerMinute:-1},{userId:G,calendarDate:'2099-01-01',steps:4000}],
  sleeps:[{userId:G,calendarDate:'2026-10-30',startTimeInSeconds:'soon',durationInSeconds:20000},{userId:G,calendarDate:'2026-10-29',startTimeInSeconds:sleepStart,durationInSeconds:200000},{userId:G,calendarDate:'2026-10-28',startTimeInSeconds:sleepStart,durationInSeconds:27000,sleepLevelsMap:'nope',naps:'nope',deepSleepDurationInSeconds:-1,lightSleepDurationInSeconds:20000,remSleepInSeconds:null}],
  hrv:[{userId:G,lastNightAvg:44},{userId:G,calendarDate:'2026-10-30',lastNightAvg:0}],
  bodyComps:[{userId:G,summaryId:'b',measurementTimeInSeconds:ts('2026-10-31T06:30:00Z'),weightInGrams:5e6,bodyFatInPercent:180},{userId:G,summaryId:'bad id with spaces',weightInGrams:70000}],
  pulseox:[{userId:G,summaryId:'p',startTimeInSeconds:sleepStart,timeOffsetSpo2Values:{'0':-1,'60':0}},{userId:G,summaryId:'p2',startTimeInSeconds:sleepStart,timeOffsetSpo2Values:'nope'}],
  allDayRespiration:{not:'a list'},activities:[{userId:G,startTimeInSeconds:sleepStart,durationInSeconds:600},{userId:G,activityId:'a b',startTimeInSeconds:sleepStart,durationInSeconds:600},{userId:G,activityId:7,startTimeInSeconds:sleepStart,durationInSeconds:200000}]};
 const rows=mapGarmin('u1',bad,{now:NOW});
 assert.deepEqual(rows.map(r=>r.kind+'='+r.value).sort(),['sleep=5.56','sleep_light=5.56'],'only the one plausible sleep survives');
 assert.deepEqual(mapGarmin('u1',null),[]);assert.deepEqual(mapGarmin('u1','x'),[]);
});

test('a push is split by Garmin user; unknown users are ignored and lookups that fail do not break the delivery', async () => {
 const body={dailies:[daily,{...daily,userId:'g2',steps:5000},{...daily,userId:'g9',steps:9999},{...daily,userId:'boom'}],sleeps:[sleep]};
 const r=await handleGarminPush(JSON.stringify(body),{lookupUser:async id=>{if(id==='boom')throw Error('db down');return users[id]||null},now:NOW});
 assert.deepEqual(value(r.rows.filter(x=>x.user_id==='u1'),'steps'),[10432]);
 assert.deepEqual(value(r.rows.filter(x=>x.user_id==='u2'),'steps'),[5000]);
 assert.ok(!r.rows.some(x=>x.value===9999));
 assert.deepEqual(r.unknownUsers.sort(),['boom','g9']);assert.deepEqual(r.users.sort(),['u1','u2']);
 assert.equal(r.errors,1);
});

test('ping mode fetches each callback from Garmin only, and assigns the pulled summaries to the notifying user', async () => {
 const fetched=[];
 const callback='https://apis.garmin.com/wellness-api/rest/dailies?uploadStartTimeInSeconds=1793444400&uploadEndTimeInSeconds=1793448000&token=pull123';
 const body={dailies:[{userId:G,userAccessToken:'uat',uploadStartTimeInSeconds:1793444400,uploadEndTimeInSeconds:1793448000,callbackURL:callback},
  {userId:G,uploadStartTimeInSeconds:1,uploadEndTimeInSeconds:2,callbackURL:'https://evil.example/wellness-api/rest/dailies'},
  {userId:G,callbackURL:'http://apis.garmin.com/wellness-api/rest/dailies'}],
  activities:[{userId:G,callbackURL:'https://apis.garmin.com/wellness-api/rest/activities?uploadStartTimeInSeconds=1&uploadEndTimeInSeconds=2&token=t'}],
  hrv:[{userId:G,callbackURL:'https://apis.garmin.com/wellness-api/rest/hrv?token=t'}]};
 const r=await handleGarminPush(body,{lookupUser,now:NOW,fetchCallback:async(url,gid)=>{fetched.push([url,gid]);
  if(url.includes('/dailies'))return [{...daily,userId:undefined}];if(url.includes('/activities'))return [{...activity,userId:'someone-else'}];throw Error('expired pull token')}});
 assert.deepEqual(fetched.map(f=>f[1]),[G,G,G]);assert.equal(fetched[0][0],callback);
 assert.deepEqual(value(r.rows,'steps'),[10432]);assert.deepEqual(value(r.rows,'workout'),[45.5]);
 assert.ok(r.rows.every(x=>x.user_id==='u1'));
 assert.equal(r.skipped,2,'the two callbacks outside https://apis.garmin.com are not fetched');assert.equal(r.errors,1);
 assert.equal(garminCallbackAllowed('https://apis.garmin.com.evil.example/x'),false);assert.equal(garminCallbackAllowed('https://user:pw@apis.garmin.com/x'),false);
 const noPing=await handleGarminPush(body,{lookupUser,now:NOW});
 assert.equal(noPing.rows.length,0);
});

test('a deregistration disconnects the member and drops their data from the same delivery; a stale one can be ignored', async () => {
 const gone=[];
 const body={deregistrations:[{userId:G,userAccessToken:'uat'},{userId:'g9'}],dailies:[daily,{...daily,userId:'g2'}]};
 const r=await handleGarminPush(body,{lookupUser,onDeregister:async(uid,gid)=>{gone.push([uid,gid])},now:NOW});
 assert.deepEqual(gone,[['u1',G]]);assert.deepEqual(r.deregistered,['u1']);
 assert.ok(r.rows.every(x=>x.user_id==='u2')&&r.rows.length>0);
 assert.deepEqual(r.unknownUsers,['g9']);
 const stale=await handleGarminPush(body,{lookupUser,onDeregister:async()=>false,now:NOW});
 assert.deepEqual(stale.deregistered,[]);assert.ok(stale.rows.some(x=>x.user_id==='u1'));
 const failing=await handleGarminPush(body,{lookupUser,onDeregister:async()=>{throw Error('db')},now:NOW});
 assert.equal(failing.errors,1);assert.deepEqual(failing.deregistered,[]);
});

test('permission changes are reported to the app with clean values', async () => {
 const seen=[];
 const r=await handleGarminPush({userPermissionsChange:[{userId:G,summaryId:'x1',permissions:['ACTIVITY_EXPORT','health_export',7,'ACTIVITY_EXPORT'],changeTimeInSeconds:1793448000},{userId:'g9',permissions:[]},'junk']},{lookupUser,onPermissions:async(uid,perms)=>{seen.push([uid,perms])}});
 assert.deepEqual(seen,[['u1',['ACTIVITY_EXPORT','HEALTH_EXPORT']]]);
 assert.deepEqual(r.permissions,[{userId:'u1',permissions:['ACTIVITY_EXPORT','HEALTH_EXPORT']}]);assert.deepEqual(r.unknownUsers,['g9']);
});

test('the webhook never throws on junk', async () => {
 for(const body of ['not json','[]','null',null,42,{dailies:'x'},{dailies:[{userId:{}}]},{deregistrations:[null,{userId:null}]}]){
  const r=await handleGarminPush(body,{lookupUser});
  assert.deepEqual(r.rows,[]);
 }
});

test('the webhook token is compared exactly, and a mismatched garmin-client-id header is refused', () => {
 const expected='a'.repeat(32);
 assert.equal(garminHookAuthorized({token:expected,expected}),true);
 assert.equal(garminHookAuthorized({token:expected,expected,clientIdHeader:'ck',clientId:'ck'}),true);
 assert.equal(garminHookAuthorized({token:expected,expected,clientIdHeader:'other',clientId:'ck'}),false);
 assert.equal(garminHookAuthorized({token:'a'.repeat(31)+'b',expected}),false);
 assert.equal(garminHookAuthorized({token:'',expected:''}),false);
 assert.equal(garminHookAuthorized({token:'short',expected:'short'}),false,'a weak token is treated as not configured');
});

test('the callback page moves the code into the fragment and reports refusals', () => {
 const html=readFileSync(new URL('../public/garmin-callback.html',import.meta.url),'utf8');
 const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 const run=search=>{let to='';vm.runInNewContext(script,{URLSearchParams,location:{search,replace:u=>{to=u}}});return to};
 const to=run('?code=abc123&state=gm.xyz');
 assert.equal(to,'/#garmin_state=gm.xyz&garmin_code=abc123');
 assert.equal(run('?error=access_denied&state=gm.xyz'),'/?connection=garmin-denied');
 assert.equal(run('?state=gm.xyz'),'/?connection=garmin-denied');
 assert.equal(run('?error=server_error'),'/?connection=garmin-failed');
 assert.match(html,/name="referrer" content="no-referrer"/);
});
