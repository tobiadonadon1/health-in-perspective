const API='https://api.prod.whoop.com/developer/v2/';
export async function fetchWhoopPages(path,accessToken,{fetcher=fetch,days=90,now=Date.now()}={}){
 const records=[],seen=new Set();let nextToken;
 for(let page=0;page<40;page++){
  const url=new URL(path,API);url.searchParams.set('limit','25');url.searchParams.set('start',new Date(now-days*86400000).toISOString());url.searchParams.set('end',new Date(now).toISOString());if(nextToken)url.searchParams.set('nextToken',nextToken);
  const response=await fetcher(url,{headers:{Authorization:'Bearer '+accessToken},signal:AbortSignal.timeout(15000)});
  if(response.status===401)throw Error('WHOOP access has expired or was revoked. Reconnect WHOOP.');
  if(response.status===429)throw Error('WHOOP is temporarily limiting requests. Please sync again later.');
  if(!response.ok)throw Error('WHOOP is temporarily unavailable. Your existing readings are unchanged.');
  const body=await response.json();if(!Array.isArray(body.records))throw Error('WHOOP returned an unexpected response.');
  records.push(...body.records);nextToken=body.next_token;if(!nextToken)return records;
  if(typeof nextToken!=='string'||seen.has(nextToken))throw Error('WHOOP returned an invalid history cursor.');seen.add(nextToken);
 }
 throw Error('WHOOP history exceeded the synchronization limit.');
}
// Cycles need the separate read:cycles scope; any failure there leaves recovery and sleep untouched.
export async function fetchWhoopCycles(accessToken,options={}){try{return await fetchWhoopPages('cycle',accessToken,options)}catch{return null}}
export async function collectWhoopData(accessToken,options={}){
 const [recovery,sleeps,cycles]=await Promise.all([fetchWhoopPages('recovery',accessToken,options),fetchWhoopPages('activity/sleep',accessToken,options),fetchWhoopCycles(accessToken,options)]);
 return {recovery,sleeps,cycles:cycles||[],cyclesAvailable:cycles!==null};
}
export function mapWhoopReadings(userId,recovery,sleeps,cycles=[]){
 const rows=[],sleepById=new Map(sleeps.map(v=>[String(v.id),v]));
 const add=(base,kind,unit,value)=>{if(Number.isFinite(value))rows.push({...base,kind,unit,value:Math.round(value*100)/100})};
 for(const v of recovery){
  if(v.score_state!=='SCORED'||!v.score||v.cycle_id==null)continue;
  const observed_at=sleepById.get(String(v.sleep_id))?.end||v.created_at;if(!Number.isFinite(Date.parse(observed_at)))continue;
  const base={user_id:userId,source:'WHOOP',external_id:String(v.cycle_id),observed_at};
  for(const [field,kind,unit] of [['resting_heart_rate','resting_hr','bpm'],['hrv_rmssd_milli','hrv','ms'],['spo2_percentage','spo2','%'],['recovery_score','recovery','%'],['skin_temp_celsius','skin_temperature','°C']])add(base,kind,unit,v.score[field]);
 }
 for(const v of sleeps){
  if(v.score_state!=='SCORED'||!v.score||!v.id||!Number.isFinite(Date.parse(v.end)))continue;
  const base={user_id:userId,source:'WHOOP',external_id:String(v.id),observed_at:v.end},stage=v.score.stage_summary;
  if(stage){const values=['total_light_sleep_time_milli','total_slow_wave_sleep_time_milli','total_rem_sleep_time_milli'].map(k=>stage[k]);if(values.every(x=>Number.isFinite(x)&&x>=0))add(base,v.nap?'nap':'sleep','hours',values.reduce((a,b)=>a+b,0)/3600000)}
  if(!v.nap){
   add(base,'respiratory_rate','breaths/min',v.score.respiratory_rate);
   for(const [field,kind] of [['sleep_performance_percentage','sleep_performance'],['sleep_efficiency_percentage','sleep_efficiency'],['sleep_consistency_percentage','sleep_consistency']])add(base,kind,'%',v.score[field]);
   if(stage){for(const [field,kind,unit,divisor] of [['total_slow_wave_sleep_time_milli','sleep_deep','hours',3600000],['total_rem_sleep_time_milli','sleep_rem','hours',3600000],['total_light_sleep_time_milli','sleep_light','hours',3600000],['total_awake_time_milli','sleep_awake','min',60000],['disturbance_count','sleep_disturbances','',1]])if(Number.isFinite(stage[field])&&stage[field]>=0)add(base,kind,unit,stage[field]/divisor);}
   const needed=v.score.sleep_needed;
   if(needed){if(Number.isFinite(needed.need_from_sleep_debt_milli)&&needed.need_from_sleep_debt_milli>=0)add(base,'sleep_debt','min',needed.need_from_sleep_debt_milli/60000);const parts=['baseline_milli','need_from_sleep_debt_milli','need_from_recent_strain_milli','need_from_recent_nap_milli'].map(k=>needed[k]);if(parts.every(Number.isFinite)&&parts.reduce((a,b)=>a+b,0)>=0)add(base,'sleep_needed','hours',parts.reduce((a,b)=>a+b,0)/3600000);}
  }
 }
 // A cycle is WHOOP's physiological day. An ongoing cycle has end:null and is re-upserted on each sync.
 for(const v of cycles||[]){
  if(v.score_state!=='SCORED'||!v.score||v.id==null)continue;
  const observed_at=v.end||v.start;if(!Number.isFinite(Date.parse(observed_at)))continue;
  const base={user_id:userId,source:'WHOOP',external_id:String(v.id),observed_at};
  add(base,'strain','',v.score.strain);
  if(Number.isFinite(v.score.kilojoule))add(base,'energy_burned','kcal',v.score.kilojoule/4.184);
  add(base,'heart_rate','bpm',v.score.average_heart_rate);
 }
 return rows;
}
export function allowedOrigin(requestOrigin,primary,extra='') {return [primary,...extra.split(',').map(s=>s.trim()).filter(Boolean)].includes(requestOrigin)?requestOrigin:null}
