// Product analytics: which steps people see, finish and leave. Fire-and-forget by design: a failed insert, a bad
// event name or an oversized payload is dropped silently and never reaches the member's screen.
// Props carry identifiers only (step ids, provider ids, counts). Health values and free text are refused at the door,
// because analytics_events is read by people who must not see anyone's readings.
export const EVENT_NAME=/^[a-z][a-z0-9_.]{2,60}$/;
const KEY=/^[a-z][a-z0-9_]{0,39}$/,TOKEN=/^[a-z0-9][a-z0-9_.:-]{0,63}$/i,MAX_PROPS=1500;
// Keys that would describe a body or a person, whatever their value looks like.
const HEALTH_KEY=/(^|_)(values?|readings?|metrics?|scores?|hrv|heart|pulse|rhr|sleep|recovery|strain|weight|height|bmi|age|gender|sex|calories|kcal|glucose|spo2|temp|temperature|notes?|text|message|title|email|name|answers?|questions?)(_|$)/i;
const uuid=()=>globalThis.crypto?.randomUUID?.()??'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(c^Math.random()*16>>c/4).toString(16));

// Small integers (counts, positions, a step index) are allowed; fractions look like measurements and are not.
function clean(v){
 if(typeof v==='boolean')return v;
 if(typeof v==='number')return Number.isInteger(v)&&Math.abs(v)<=1e6?v:undefined;
 if(typeof v==='string')return TOKEN.test(v)?v:undefined;
 if(Array.isArray(v)){const a=v.slice(0,12).map(clean).filter(x=>typeof x==='string');return a.length?a:undefined;}
 return undefined;
}
export function sanitizeProps(props={}){
 const out={};
 for(const [k,v] of Object.entries(props&&typeof props==='object'?props:{})){if(!KEY.test(k)||HEALTH_KEY.test(k))continue;const c=clean(v);if(c!==undefined)out[k]=c;}
 // Over budget: drop the last keys until it fits rather than refusing the whole event.
 const keys=Object.keys(out);while(keys.length&&JSON.stringify(out).length>MAX_PROPS)delete out[keys.pop()];
 return out;
}

export function createTracker({insert,sessionId=uuid(),now=()=>Date.now()}={}){
 const started=now();
 function track(event,{step,...props}={}){
  try{
   if(typeof insert!=='function'||typeof event!=='string'||!EVENT_NAME.test(event))return false;
   const row={event,step:typeof step==='string'&&TOKEN.test(step)&&step.length<=60?step:null,props:{...sanitizeProps(props),ms:Math.max(0,Math.round(now()-started))},session_id:sessionId};
   const pending=insert(row);
   if(pending&&typeof pending.then==='function')pending.then(null,()=>{});
   return true;
  }catch{return false}
 }
 return {track,session:sessionId};
}
