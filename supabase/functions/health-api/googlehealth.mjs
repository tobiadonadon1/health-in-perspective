// Fitbit through the Google Health API (health.googleapis.com/v4), which replaced the Fitbit Web API on 2 Nov 2026.
// Members sign in with Google; Xeyo reads their daily readings and files them under the same kinds as WHOOP and the imports.
export const GOOGLE_HEALTH_SCOPES=['sleep.readonly','health_metrics_and_measurements.readonly','activity_and_fitness.readonly'].map(s=>'https://www.googleapis.com/auth/googlehealth.'+s);
export const GOOGLE_STATE_PREFIX='gh.';
const API='https://health.googleapis.com/v4/users/me';
export const googleRedirect=origin=>origin+'/google-callback.html';

export function googleAuthUrl({clientId,origin,state}){
 const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 u.search=new URLSearchParams({client_id:clientId,redirect_uri:googleRedirect(origin),response_type:'code',access_type:'offline',prompt:'consent',include_granted_scopes:'true',scope:GOOGLE_HEALTH_SCOPES.join(' '),state}).toString();
 return u.toString();
}

export async function googleToken(body,{clientId,clientSecret},fetcher=fetch){
 const r=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...body,client_id:clientId,client_secret:clientSecret}),signal:AbortSignal.timeout(15000)});
 const t=await r.json().catch(()=>({}));
 if(!r.ok||!t.access_token)throw Error(t.error==='invalid_grant'?'Google access expired or was revoked. Reconnect Fitbit.':'Google authorization failed. Reconnect Fitbit.');
 return {...t,expires_at:Date.now()+(Number(t.expires_in)||3600)*1000};
}

// A Google account needs a Google Health profile (set up in the Google Health / Fitbit app) before its data can be read.
export async function googleIdentity(accessToken,fetcher=fetch){
 const r=await fetcher(API+'/identity',{headers:{Authorization:'Bearer '+accessToken,Accept:'application/json'},signal:AbortSignal.timeout(15000)});
 const j=await r.json().catch(()=>({}));
 if(r.ok)return j;
 if(JSON.stringify(j).includes('ACCOUNT_NOT_LINKED'))throw Error('This Google account has no Google Health profile yet. Open the Fitbit (Google Health) app, sign in with this Google account and finish setup, then connect again.');
 if(r.status===401)throw Error('Google access expired or was revoked. Reconnect Fitbit.');
 throw Error('Google Health did not confirm your account. Try connecting again.');
}

const iso=d=>d.toISOString().slice(0,10);
const civil=d=>({date:{year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate()},time:{hours:0,minutes:0,seconds:0,nanos:0}});
const dateString=d=>d&&d.year?`${d.year}-${String(d.month).padStart(2,'0')}-${String(d.day).padStart(2,'0')}`:'';

// The docs show both snake_case and camelCase filter fields; try one, then the other.
const camel=s=>s.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());
async function call(fetcher,token,url,init={}){
 const r=await fetcher(url,{...init,headers:{Authorization:'Bearer '+token,Accept:'application/json',...(init.body?{'Content-Type':'application/json'}:{}),...(init.headers||{})},signal:AbortSignal.timeout(20000)});
 const j=await r.json().catch(()=>({}));
 if(r.status===401)throw Error('Google access expired or was revoked. Reconnect Fitbit.');
 return {ok:r.ok,status:r.status,json:j};
}
async function listAll(fetcher,token,type,filterField,op,value,{pageSize,maxPages=8}={}){
 for(const field of [filterField,camel(filterField)]){
  const points=[];let pageToken='',ok=true;
  for(let page=0;page<maxPages;page++){
   const q=new URLSearchParams({filter:`${field} ${op} "${value}"`});if(pageSize)q.set('pageSize',String(pageSize));if(pageToken)q.set('pageToken',pageToken);
   const r=await call(fetcher,token,`${API}/dataTypes/${type}/dataPoints?${q}`);
   if(!r.ok){ok=false;break}
   points.push(...(r.json.dataPoints||[]));pageToken=r.json.nextPageToken||'';if(!pageToken)break;
  }
  if(ok)return points;
 }
 return null; // this data type is unavailable for this member (missing scope or unsupported); others still sync
}
async function dailyRollUp(fetcher,token,type,since,until){
 const r=await call(fetcher,token,`${API}/dataTypes/${type}/dataPoints:dailyRollUp`,{method:'POST',body:JSON.stringify({range:{start:civil(since),end:civil(until)},windowSizeDays:1,pageSize:90})});
 return r.ok?(r.json.rollupDataPoints||[]):null;
}

export async function collectGoogleHealth(token,{days=30,now=Date.now(),fetcher=fetch}={}){
 const since=new Date(now-days*86400000),until=new Date(now+86400000);since.setUTCHours(0,0,0,0);until.setUTCHours(0,0,0,0);
 const day=iso(since),stamp=since.toISOString();
 const [sleep,rhr,hrv,spo2,resp,weight,bodyFat,steps,energy]=await Promise.all([
  listAll(fetcher,token,'sleep','sleep.interval.end_time','>=',stamp,{pageSize:25}),
  listAll(fetcher,token,'daily-resting-heart-rate','daily_resting_heart_rate.date','>=',day),
  listAll(fetcher,token,'daily-heart-rate-variability','daily_heart_rate_variability.date','>=',day),
  listAll(fetcher,token,'daily-oxygen-saturation','daily_oxygen_saturation.date','>=',day),
  listAll(fetcher,token,'daily-respiratory-rate','daily_respiratory_rate.date','>=',day),
  listAll(fetcher,token,'weight','weight.sample_time.physical_time','>=',stamp),
  listAll(fetcher,token,'body-fat','body_fat.sample_time.physical_time','>=',stamp),
  dailyRollUp(fetcher,token,'steps',since,until),
  dailyRollUp(fetcher,token,'active-energy-burned',since,until)]);
 return {sleep,rhr,hrv,spo2,resp,weight,bodyFat,steps,energy};
}

export function mapGoogleHealth(userId,data){
 const rows=[],num=v=>v===undefined||v===null||v===''?NaN:Number(v);
 const add=(kind,unit,value,observed_at,external_id)=>{if(Number.isFinite(value)&&value>=0&&Number.isFinite(Date.parse(observed_at)))rows.push({user_id:userId,source:'Fitbit',kind,unit,value:Math.round(value*100)/100,observed_at:new Date(observed_at).toISOString(),external_id})};
 const daily=(list,field,pick,kind,unit)=>{for(const p of list||[]){const v=p[field],date=dateString(v?.date);if(date)add(kind,unit,num(pick(v)),date+'T12:00:00Z','gh:'+kind+':'+date)}};
 for(const p of data.sleep||[]){
  const s=p.sleep,end=s?.interval?.endTime;if(!s||!end)continue;
  const id='gh:'+(p.name||end),nap=s.metadata?.nap===true||s.metadata?.mainSleep===false,asleep=num(s.summary?.minutesAsleep);
  add(nap?'nap':'sleep','hours',asleep/60,end,id);if(nap)continue;
  const stage=t=>(s.summary?.stagesSummary||[]).find(x=>x.type===t);
  for(const [type,kind,unit,div] of [['LIGHT','sleep_light','hours',60],['DEEP','sleep_deep','hours',60],['REM','sleep_rem','hours',60],['AWAKE','sleep_awake','min',1]]){const st=stage(type);if(st)add(kind,unit,num(st.minutes)/div,end,id)}
 }
 daily(data.rhr,'dailyRestingHeartRate',v=>v.beatsPerMinute,'resting_hr','bpm');
 daily(data.hrv,'dailyHeartRateVariability',v=>v.averageHeartRateVariabilityMilliseconds,'hrv','ms');
 daily(data.spo2,'dailyOxygenSaturation',v=>v.averagePercentage,'spo2','%');
 daily(data.resp,'dailyRespiratoryRate',v=>v.breathsPerMinute,'respiratory_rate','breaths/min');
 for(const p of data.weight||[]){const w=p.weight,t=w?.sampleTime?.physicalTime;if(t)add('weight','kg',num(w.weightGrams)/1000,t,'gh:'+(p.name||t))}
 for(const p of data.bodyFat||[]){const b=p.bodyFat,t=b?.sampleTime?.physicalTime;if(t)add('body_fat','%',num(b.percentage),t,'gh:'+(p.name||t))}
 for(const [list,field,pick,kind,unit] of [[data.steps,'steps',v=>v.countSum,'steps',''],[data.energy,'activeEnergyBurned',v=>v.kcalSum,'active_energy','kcal']])
  for(const p of list||[]){const date=dateString(p.civilStartTime?.date);if(date&&p[field])add(kind,unit,num(pick(p[field])),date+'T12:00:00Z','gh:'+kind+':'+date)}
 return rows;
}
