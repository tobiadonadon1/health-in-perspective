const DAY=86400000,EARLIEST=Date.UTC(2000,0,1);
// Kind → [unit, maximum]. Workout kinds come from WHOOP's workouts.csv: one row per workout, filed at its start time.
const schema={resting_hr:['bpm',300],heart_rate:['bpm',300],hrv:['ms',2000],hrv_sdnn:['ms',2000],spo2:['%',100],respiratory_rate:['breaths/min',100],sleep:['hours',24],nap:['hours',24],sleep_deep:['hours',24],sleep_rem:['hours',24],sleep_light:['hours',24],sleep_awake:['min',1440],weight:['kg',1000],body_fat:['%',100],lean_mass:['kg',1000],steps:['',200000],active_energy:['kcal',20000],skin_temperature:['°C',45],recovery:['%',100],strain:['',21],energy_burned:['kcal',20000],sleep_performance:['%',100],sleep_efficiency:['%',100],sleep_consistency:['%',100],sleep_debt:['min',1440],sleep_needed:['hours',24],sleep_disturbances:['',1000],
 workout:['min',1440],workout_strain:['',21],workout_energy:['kcal',10000],workout_avg_hr:['bpm',300],workout_max_hr:['bpm',300]};
// WHOOP export rows carry the START time of their cycle, sleep or workout, so a re-upload upserts the same rows even when
// a night's values are rescored. Anything else, or a malformed id, falls back to the per-day hash.
const WHOOP_ID=/^whoop:(cycle|sleep|workout):(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)$/;
function whoopId(value,now){const m=typeof value==='string'&&value.match(WHOOP_ID);if(!m)return null;const t=Date.parse(m[2]);return Number.isFinite(t)&&t>=EARLIEST&&t<=now+DAY?value:null}
const isDay=(v,now)=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const t=Date.parse(v+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===v&&t>=EARLIEST&&t<=now+DAY};
export async function validateImportedReadings(payload,userId,now=Date.now()){
 if(!['apple','fitbit','whoop'].includes(payload.provider)||!Array.isArray(payload.rows)||!payload.rows.length||payload.rows.length>2000)throw Error('Choose a supported import with at most 2,000 readings per batch.');
 const result=[];for(const r of payload.rows){const rule=schema[r.kind],time=Date.parse(r.observed_at);if(!rule||r.unit!==rule[0]||typeof r.value!=='number'||!Number.isFinite(r.value)||r.value<0||r.value>rule[1]||!Number.isFinite(time)||time<EARLIEST||time>now+DAY||typeof r.device!=='string'||r.device.length>70||!['daily mean','daily total','latest daily'].includes(r.aggregation)||(r.label!==undefined&&(typeof r.label!=='string'||r.label.length>100)))throw Error('The export contains an unsupported measurement or unit.');const source=(payload.provider==='apple'?'Apple Health import':payload.provider==='whoop'?'WHOOP import':'Fitbit import')+' · '+r.device;
  let external_id=payload.provider==='whoop'?whoopId(r.external_id,now):null;
  if(!external_id){const day=/^\d{4}-\d{2}-\d{2}$/.test(r.day||'')&&Math.abs(Date.parse(r.day+'T12:00:00Z')-time)<=36*3600000?r.day:new Date(time).toISOString().slice(0,10);const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode([source,r.kind,day].join('|')));external_id='import:'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')}
  result.push({user_id:userId,kind:r.kind,value:r.value,unit:r.unit,source,observed_at:new Date(time).toISOString(),external_id});}
 // One upsert cannot touch the same key twice, so a repeated (source, kind, day) keeps its latest observation.
 const unique=new Map();for(const row of result){const old=unique.get(row.kind+'|'+row.source+'|'+row.external_id);if(!old||row.observed_at>old.observed_at)unique.set(row.kind+'|'+row.source+'|'+row.external_id,row)}return [...unique.values()];
}
// Yes/no answers from WHOOP's journal_entries.csv, for public.wearable_behaviors (upsert on user_id,source,external_id).
// Lengths follow the table's checks: external_id ≤ 200, question 1–200, notes ≤ 1000.
export function validateImportedBehaviors(payload,userId,now=Date.now()){
 if(payload?.provider!=='whoop'||!Array.isArray(payload.rows)||!payload.rows.length||payload.rows.length>2000)throw Error('Choose a WHOOP journal import with at most 2,000 answers per batch.');
 const unique=new Map();
 for(const r of payload.rows){const question=typeof r?.question==='string'?r.question.trim():'',notes=r?.notes==null?'':r.notes;
  if(typeof r?.external_id!=='string'||r.external_id.length>200||!/^whoop:journal:[A-Za-z0-9:._-]{1,180}$/.test(r.external_id)||!isDay(r.day,now)||!question||question.length>200||typeof r.answered_yes!=='boolean'||typeof notes!=='string'||notes.length>1000)throw Error('The export contains an unsupported journal answer.');
  unique.set(r.external_id,{user_id:userId,source:'WHOOP import',external_id:r.external_id,day:r.day,question,answered_yes:r.answered_yes,notes});}
 return [...unique.values()];
}
// The summary row for public.wearable_imports, written once every batch of an upload has been saved.
export function validateImportFinish(payload,userId,now=Date.now()){
 const day=v=>v==null||v===''?null:isDay(v,now)?v:undefined,first=day(payload?.first_day),last=day(payload?.last_day),files=payload?.files??[];
 if(!['apple','fitbit','whoop'].includes(payload?.provider)||!Number.isInteger(payload.row_count)||payload.row_count<0||payload.row_count>10000000||first===undefined||last===undefined||(first&&last&&first>last)||!Array.isArray(files)||files.length>20||files.some(f=>typeof f!=='string'||!f.trim()||f.length>200))throw Error('The import summary is not valid.');
 return {user_id:userId,provider:payload.provider,row_count:payload.row_count,first_day:first,last_day:last,files:files.map(f=>f.trim())};
}
