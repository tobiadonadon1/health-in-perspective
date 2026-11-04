// Garmin Connect through the Garmin Connect Developer Program (Health API + Activity API), free for every member.
// Garmin does not want partners to poll: members sign in once (OAuth 2.0 + PKCE), then Garmin pushes each new summary to
// our webhook. This module is pure and dependency-injected (fetcher, lookups, callbacks) so it runs in Deno and in node:test.
//
// GARMIN_NOTES: what to configure in the Garmin developer portal (apis.garmin.com/tools, production app)
// - Secrets in Supabase: GARMIN_CLIENT_ID (consumer key), GARMIN_CLIENT_SECRET (consumer secret), GARMIN_WEBHOOK_TOKEN
//   (long random string, e.g. `openssl rand -hex 32`). TOKEN_ENCRYPTION_KEY is reused for sealing tokens and deriving PKCE.
// - OAuth redirect URLs: https://app.xeyo.ai/garmin-callback.html (plus any ALLOWED_ORIGINS used for staging/localhost).
// - Endpoint Configuration (apis.garmin.com/tools/endpoints): for each type below choose PUSH (not PING) and set the URL
//   <SUPABASE_URL>/functions/v1/health-api?hook=garmin&token=<GARMIN_WEBHOOK_TOKEN>
//   Health API: Dailies, Sleeps, HRV Summary, Body Compositions, Pulse Ox, Respiration (allDayRespiration).
//   Activity API: Activities, Manually Updated Activities. Common: Deregistrations, User Permissions Change.
//   Leave off (nothing maps to our kinds, and they are large): Epochs, Stress Details, Activity Details, Activity Files,
//   MoveIQ, Skin Temperature, Blood Pressure, User Metrics, Health Snapshot, Women's Health. Enabling them is harmless.
// - Ping mode also works (handleGarminPush fetches each callbackURL through fetchCallback) but needs a member token at
//   webhook time; push keeps tokens out of the webhook path.
// - Garmin expects a quick HTTP 200 from the webhook; answer non-2xx only when our own save failed, so Garmin retries.
export const GARMIN_STATE_PREFIX='gm.';
// Endpoints from Garmin's "OAuth2.0 PKCE Specification" (developerportal.garmin.com/sites/default/files/OAuth2PKCE.pdf).
// Several working clients use https://diauth.garmin.com/di-oauth2-service/oauth/token for the token; the spec names connectapi.
export const GARMIN_AUTH_URL='https://connect.garmin.com/oauth2Confirm';
export const GARMIN_TOKEN_URL='https://connectapi.garmin.com/di-oauth2-service/oauth/token';
export const GARMIN_API_HOST='apis.garmin.com';
export const GARMIN_API='https://'+GARMIN_API_HOST+'/wellness-api/rest';
// Backfill asks Garmin to re-push history to the webhook (202 accepted, 409 already requested for that range, 403/412 the
// member did not allow historical data). Push key → backfill path; at most 30 days per request.
export const GARMIN_BACKFILL_TYPES={dailies:'dailies',sleeps:'sleeps',hrv:'hrv',bodyComps:'bodyComps',pulseox:'pulseOx',allDayRespiration:'respiration',activities:'activities'};
export const GARMIN_BACKFILL_MAX_DAYS=30;
export const garminRedirect=origin=>origin+'/garmin-callback.html';
const RECONNECT='Garmin access expired or was revoked. Reconnect Garmin.';

const b64url=bytes=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
const utf8=s=>new TextEncoder().encode(s);
export const pkceChallenge=async verifier=>b64url(new Uint8Array(await crypto.subtle.digest('SHA-256',utf8(verifier))));
// A random verifier (64 chars from 48 random bytes; Garmin accepts 43–128 of A-Z a-z 0-9 - . _ ~).
export async function createPkce(){const verifier=b64url(crypto.getRandomValues(new Uint8Array(48)));return {verifier,challenge:await pkceChallenge(verifier)}}
// oauth_states has no column for a verifier, so it is derived instead: HMAC-SHA256(server secret, state). The state is random
// and single-use and the secret never leaves the server, so whoever intercepts the code cannot compute the verifier.
export async function garminPkceForState(state,secret){
 if(typeof state!=='string'||!state||typeof secret!=='string'||!secret)throw Error('Garmin is not configured.');
 const key=await crypto.subtle.importKey('raw',utf8(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const verifier=b64url(new Uint8Array(await crypto.subtle.sign('HMAC',key,utf8('xeyo-garmin-pkce|'+state)))); // 43 chars
 return {verifier,challenge:await pkceChallenge(verifier)};
}

export function garminAuthUrl({clientId,origin,state,challenge}){
 if(!clientId||!origin||!state||!challenge)throw Error('Garmin is not configured.');
 const u=new URL(GARMIN_AUTH_URL);
 u.search=new URLSearchParams({response_type:'code',client_id:clientId,code_challenge:challenge,code_challenge_method:'S256',redirect_uri:garminRedirect(origin),state}).toString();
 return u.toString();
}

// Garmin access tokens last 24 h; refresh tokens about 90 days and are replaced on every refresh, so always store the new one.
// expires_at is moved 10 minutes early, as Garmin recommends, so a refresh happens before the token actually lapses.
export async function garminToken(body,{clientId,clientSecret},fetcher=fetch){
 if(!clientId||!clientSecret)throw Error('Garmin is not configured.');
 let r;
 try{r=await fetcher(GARMIN_TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({...body,client_id:clientId,client_secret:clientSecret}),signal:AbortSignal.timeout(15000)})}
 catch{throw Error('Garmin did not respond. Try connecting Garmin again.')}
 const t=await r.json().catch(()=>({}))||{};
 if(!r.ok||typeof t.access_token!=='string'||!t.access_token)throw Error(r.status===401||/invalid_grant/.test(JSON.stringify(t))?RECONNECT:'Garmin authorization failed. Reconnect Garmin.');
 const now=Date.now(),life=Number(t.expires_in)>0?Number(t.expires_in):86400,refreshLife=Number(t.refresh_token_expires_in);
 return {...t,expires_at:now+Math.max(60,life-600)*1000,...(refreshLife>0?{refresh_token_expires_at:now+refreshLife*1000}:{})};
}

async function call(fetcher,token,url,init={}){
 let r;
 try{r=await fetcher(url,{...init,headers:{Authorization:'Bearer '+token,Accept:'application/json',...(init.headers||{})},signal:AbortSignal.timeout(20000)})}catch{return {ok:false,status:0,json:null}}
 return {ok:r.ok,status:r.status,json:await r.json().catch(()=>null)};
}
// The Garmin user id is stable across re-authorizations and is what every push carries (stored as wearable_secrets.external_user_id).
export async function garminUserId(token,fetcher=fetch){
 const r=await call(fetcher,token,GARMIN_API+'/user/id');
 if(r.status===401)throw Error(RECONNECT);
 const id=r.json?.userId;
 if(!r.ok||!(typeof id==='string'||typeof id==='number')||!String(id).length||String(id).length>200)throw Error('Garmin did not confirm your account. Try connecting Garmin again.');
 return String(id);
}
// The spec shows a bare array; some clients see {permissions:[...]}. Anything else is an error, never "no permissions".
export async function garminPermissions(token,fetcher=fetch){
 const r=await call(fetcher,token,GARMIN_API+'/user/permissions');
 if(r.status===401)throw Error(RECONNECT);
 const list=Array.isArray(r.json)?r.json:Array.isArray(r.json?.permissions)?r.json.permissions:null;
 if(!r.ok||!list)throw Error('Garmin did not return your sharing permissions.');
 return [...new Set(list.filter(p=>typeof p==='string'&&p.length<=60).map(p=>p.toUpperCase()))];
}
// Required by Garmin whenever a member disconnects (or deletes their account) outside Garmin Connect. Never throws.
export async function garminDeregister(token,fetcher=fetch){return (await call(fetcher,token,GARMIN_API+'/user/registration',{method:'DELETE'})).ok}

export async function requestGarminBackfill(token,{days=GARMIN_BACKFILL_MAX_DAYS,now=Date.now(),fetcher=fetch,types=Object.keys(GARMIN_BACKFILL_TYPES)}={}){
 const end=Math.floor(now/1000),span=Math.round(Math.min(Math.max(Number(days)||1,1),90)*86400),windows=[];
 for(let to=end;to>end-span;to-=GARMIN_BACKFILL_MAX_DAYS*86400)windows.push([Math.max(end-span,to-GARMIN_BACKFILL_MAX_DAYS*86400),to]);
 const result={requested:[],duplicate:[],denied:[],failed:[]};
 for(const type of types){
  const path=GARMIN_BACKFILL_TYPES[type];if(!path)continue;
  const statuses=[];
  for(const [from,to] of windows){
   const r=await call(fetcher,token,`${GARMIN_API}/backfill/${path}?`+new URLSearchParams({summaryStartTimeInSeconds:String(from),summaryEndTimeInSeconds:String(to)}));
   if(r.status===401)throw Error(RECONNECT);
   statuses.push(r.status);
  }
  result[statuses.some(s=>s>=200&&s<300)?'requested':statuses.every(s=>s===409)?'duplicate':statuses.some(s=>s===403||s===412)?'denied':'failed'].push(type);
 }
 return result;
}

// The push URL carries GARMIN_WEBHOOK_TOKEN; Garmin also sends its consumer key as the garmin-client-id header (checked when present).
const sameText=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
export function garminHookAuthorized({token,expected,clientIdHeader,clientId}){
 if(!expected||expected.length<16||!sameText(token,expected))return false;
 return !(clientId&&clientIdHeader!=null&&clientIdHeader!==''&&!sameText(clientIdHeader,clientId));
}

// Limits mirror imports.mjs `schema` (unit, maximum) with a floor that rejects Garmin's 0 / -1 "not measured" placeholders.
const KINDS={resting_hr:['bpm',300,20],heart_rate:['bpm',300,20],hrv:['ms',2000,1],spo2:['%',100,50],respiratory_rate:['breaths/min',100,3],
 sleep:['hours',24,0.05],nap:['hours',24,0.02],sleep_deep:['hours',24,0],sleep_rem:['hours',24,0],sleep_light:['hours',24,0],sleep_awake:['min',1440,0],
 weight:['kg',1000,1],body_fat:['%',100,1],steps:['',200000,0],active_energy:['kcal',20000,0],energy_burned:['kcal',20000,0],
 workout:['min',1440,1],workout_energy:['kcal',10000,0],workout_avg_hr:['bpm',300,20],workout_max_hr:['bpm',300,20]};
const MAX_ITEMS=5000;
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const list=v=>Array.isArray(v)?v.slice(0,MAX_ITEMS).filter(isObj):[];
const num=v=>typeof v==='number'?v:typeof v==='string'&&v.trim()!==''?Number(v):NaN;
const secs=v=>{const n=num(v);return Number.isFinite(n)&&n>0&&n<1e11?n*1000:NaN};
const validDay=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const t=Date.parse(s+'T12:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===s};
// Garmin's own calendar date (the member's local day); otherwise the local day of the summary's start.
const dayOf=x=>{if(validDay(x.calendarDate))return x.calendarDate;const t=secs(x.startTimeInSeconds);if(!Number.isFinite(t))return '';const off=num(x.startTimeOffsetInSeconds),d=new Date(t+(Number.isFinite(off)&&Math.abs(off)<=14*3600?off*1000:0));return Number.isFinite(d.getTime())&&d.getUTCFullYear()<10000?d.toISOString().slice(0,10):''};
const idOf=(x,fallback)=>{for(const v of [x.summaryId,fallback])if((typeof v==='string'||typeof v==='number')&&/^[\w.:-]{1,120}$/.test(String(v)))return String(v);return ''};
const mean=o=>{if(!isObj(o))return NaN;const v=Object.values(o).map(num).filter(n=>Number.isFinite(n)&&n>0);return v.length?v.reduce((a,b)=>a+b,0)/v.length:NaN};
// A day's summary is re-pushed as the day fills in; within one payload keep the most complete copy.
const bestPerDay=items=>{const m=new Map();for(const x of items){let day='';try{day=dayOf(x)}catch{}if(!day)continue;const old=m.get(day);if(!old||!(num(old.durationInSeconds)>num(x.durationInSeconds)))m.set(day,x)}return [...m.entries()]};

// Rows for one member from one push payload ({dailies:[...], sleeps:[...], ...}). Bad records are skipped, never thrown.
export function mapGarmin(userId,payload,{now=Date.now()}={}){
 const rows=new Map();if(!isObj(payload))return [];
 const add=(kind,value,observedMs,key)=>{const [unit,max,min]=KINDS[kind];if(!key||!Number.isFinite(value)||value<min||value>max||!Number.isFinite(observedMs)||observedMs<Date.UTC(2000,0,1)||observedMs>now+86400000)return;
  const external_id='gm:'+kind+':'+key;rows.set(kind+'|'+external_id,{user_id:userId,source:'Garmin',kind,unit,value:Math.round(value*100)/100,observed_at:new Date(observedMs).toISOString(),external_id})};
 const safely=(items,fn)=>{for(const x of items){try{fn(x)}catch{}}};
 safely(bestPerDay(list(payload.dailies)),([day,d])=>{
  const noon=Date.parse(day+'T12:00:00Z'),active=num(d.activeKilocalories),bmr=num(d.bmrKilocalories);
  add('steps',num(d.steps),noon,day);add('active_energy',active,noon,day);
  if(Number.isFinite(active)&&Number.isFinite(bmr)&&active>=0&&bmr>0)add('energy_burned',active+bmr,noon,day);
  add('resting_hr',num(d.restingHeartRateInBeatsPerMinute),noon,day);add('heart_rate',num(d.averageHeartRateInBeatsPerMinute),noon,day);
 });
 // Asleep time is the stage total (light + deep + REM); awake time is its own reading. Unstaged (manual) sleep uses the duration.
 safely(bestPerDay(list(payload.sleeps)),([day,s])=>{
  const start=secs(s.startTimeInSeconds),dur=num(s.durationInSeconds);if(!Number.isFinite(start)||!(dur>0)||dur>86400)return;
  let end=start+dur*1000;
  if(isObj(s.sleepLevelsMap))for(const v of Object.values(s.sleepLevelsMap))for(const p of list(v)){const e=secs(p.endTimeInSeconds);if(e>end&&e<=start+86400000)end=e}
  const [deep,light,rem,awake]=['deepSleepDurationInSeconds','lightSleepDurationInSeconds','remSleepInSeconds','awakeDurationInSeconds'].map(k=>num(s[k]));
  const staged=[deep,light,rem].filter(n=>Number.isFinite(n)&&n>=0);
  add('sleep',(staged.length?staged.reduce((a,b)=>a+b,0):dur)/3600,end,day);
  if(staged.length){add('sleep_deep',deep/3600,end,day);add('sleep_light',light/3600,end,day);add('sleep_rem',rem/3600,end,day)}
  add('sleep_awake',awake/60,end,day);
  add('spo2',num(s.avgOxygenSaturationPercentage??s.averageSpO2Value),end,day);add('respiratory_rate',num(s.respirationAvg??s.averageRespirationValue),end,day);
  safely(list(s.naps),n=>{const t=secs(n.napStartTimeInSeconds),d=num(n.napDurationInSeconds);if(Number.isFinite(t))add('nap',d/3600,t+d*1000,day+':'+Math.round(t/1000))});
 });
 safely(list(payload.hrv),h=>{const day=dayOf(h);if(day)add('hrv',num(h.lastNightAvg),Date.parse(day+'T12:00:00Z'),day)});
 safely(list(payload.bodyComps),b=>{const t=secs(b.measurementTimeInSeconds),key=idOf(b,Number.isFinite(t)?t/1000:'');add('weight',num(b.weightInGrams)/1000,t,key);add('body_fat',num(b.bodyFatInPercent),t,key)});
 safely(list(payload.pulseox),p=>{const t=secs(p.startTimeInSeconds),avg=num(p.avgSpo2);add('spo2',Number.isFinite(avg)?avg:mean(p.timeOffsetSpo2Values),t,idOf(p,Number.isFinite(t)?t/1000:''))});
 safely([...list(payload.allDayRespiration),...list(payload.respiration)],p=>{const t=secs(p.startTimeInSeconds);add('respiratory_rate',mean(p.timeOffsetEpochToBreaths??p.timeOffsetRespirationValues),t,idOf(p,Number.isFinite(t)?t/1000:''))});
 // Workouts use the WHOOP export's kinds, dated at the start. activityId is shared by the activity and its manual edits.
 safely([...list(payload.activities),...list(payload.manuallyUpdatedActivities)],a=>{
  const t=secs(a.startTimeInSeconds),key=idOf({summaryId:a.activityId},a.summaryId);if(!key)return;
  add('workout',num(a.durationInSeconds)/60,t,key);add('workout_energy',num(a.activeKilocalories),t,key);
  add('workout_avg_hr',num(a.averageHeartRateInBeatsPerMinute),t,key);add('workout_max_hr',num(a.maxHeartRateInBeatsPerMinute),t,key);
 });
 return [...rows.values()];
}

const DATA_TYPES=['dailies','sleeps','hrv','bodyComps','pulseox','allDayRespiration','respiration','activities','manuallyUpdatedActivities'];
const garminId=v=>(typeof v==='string'||typeof v==='number')&&String(v).length>0&&String(v).length<=200?String(v):'';
// Ping callbacks are fetched only from Garmin's API host over HTTPS, so a forged notification cannot point us elsewhere.
export function garminCallbackAllowed(url){try{const u=new URL(url);return u.protocol==='https:'&&u.hostname===GARMIN_API_HOST&&!u.username&&!u.password}catch{return false}}

// One webhook delivery → rows to upsert, plus lifecycle effects. Deregistrations run first: a member who withdrew consent in the
// same delivery gets no new data. onDeregister may return false to ignore a stale deregistration (the member already reconnected).
/** @param {any} body @param {any} [handlers] */
export async function handleGarminPush(body,{lookupUser,fetchCallback,onDeregister,onPermissions,now=Date.now()}={}){
 const out={rows:[],unknownUsers:[],deregistered:[],permissions:[],users:[],skipped:0,errors:0};
 let payload=body;if(typeof body==='string'){try{payload=JSON.parse(body)}catch{out.errors++;return out}}
 if(!isObj(payload))return out;
 const cache=new Map(),unknown=new Set(),gone=new Set();
 const resolve=gid=>{if(!gid)return Promise.resolve(null);if(!cache.has(gid))cache.set(gid,Promise.resolve().then(()=>lookupUser?.(gid)).then(u=>typeof u==='string'&&u?u:null,()=>{out.errors++;return null}));return cache.get(gid).then(u=>{if(!u)unknown.add(gid);return u})};
 for(const e of list(payload.deregistrations)){const gid=garminId(e.userId),uid=await resolve(gid);if(!uid){out.skipped++;continue}
  try{if((await onDeregister?.(uid,gid))!==false){gone.add(uid);if(!out.deregistered.includes(uid))out.deregistered.push(uid)}}catch{out.errors++}}
 for(const e of list(payload.userPermissionsChange)){const gid=garminId(e.userId),uid=await resolve(gid);if(!uid||gone.has(uid)){out.skipped++;continue}
  const perms=[...new Set((Array.isArray(e.permissions)?e.permissions:[]).filter(p=>typeof p==='string'&&p.length<=60).map(p=>p.toUpperCase()))];
  try{await onPermissions?.(uid,perms,gid);out.permissions.push({userId:uid,permissions:perms})}catch{out.errors++}}
 const byUser=new Map(),put=(uid,type,item)=>{if(!byUser.has(uid))byUser.set(uid,{});(byUser.get(uid)[type]??=[]).push(item)},pings=[];
 for(const type of DATA_TYPES)for(const item of list(payload[type])){
  const gid=garminId(item.userId),uid=await resolve(gid);
  if(!uid||gone.has(uid)){out.skipped++;continue}
  if(item.callbackURL===undefined){put(uid,type,item);continue}
  if(!fetchCallback||!garminCallbackAllowed(item.callbackURL)){out.skipped++;continue}
  pings.push(Promise.resolve().then(()=>fetchCallback(item.callbackURL,gid)).then(got=>{for(const x of list(Array.isArray(got)?got:got?.[type]))put(uid,type,{...x,userId:gid})},()=>{out.errors++}));
 }
 await Promise.all(pings);
 for(const [uid,group] of byUser){let rows=[];try{rows=mapGarmin(uid,group,{now})}catch{out.errors++}if(rows.length){out.rows.push(...rows);out.users.push(uid)}}
 out.unknownUsers=[...unknown];
 return out;
}
