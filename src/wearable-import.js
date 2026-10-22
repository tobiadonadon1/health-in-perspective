// Import explicit measured fields only. Original files stay in the browser.
const DAY=86400000;
export function parseDate(value){if(typeof value!=='string')return null;let v=value.trim();if(/^\d{4}-\d{2}-\d{2}$/.test(v))v+='T12:00:00Z';v=v.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/,'$1T$2$3:$4');const m=v.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})(.*)$/);if(m)v=`${m[3].length===2?'20'+m[3]:m[3]}-${m[1]}-${m[2]}${m[4].trim()?'T'+m[4].trim():'T12:00:00'}Z`;const time=Date.parse(v);return Number.isFinite(time)?new Date(time).toISOString():null;}
export function createCollector(now=Date.now()){
 const days=new Map(),seen=new Set();let ignored=0;
 function add(kind,value,unit,date,device='',mode='mean',identity=''){
  const time=parseDate(date);if(value===null||value===undefined||value===''||!time||Date.parse(time)<now-90*DAY||Date.parse(time)>now+DAY||!Number.isFinite(Number(value))||+value<0){ignored++;return}value=+value;device=String(device).slice(0,70);
  const id=[kind,time,device,identity||value].join('|');if(seen.has(id))return;seen.add(id);
  const key=[kind,time.slice(0,10),device].join('|'),old=days.get(key);
  if(!old)days.set(key,{kind,value,unit,observed_at:time,device,mode,count:1});
  else{if(mode==='sum')old.value+=value;else if(mode==='last'){if(time>=old.observed_at)old.value=value}else old.value+=value;old.count++;if(time>old.observed_at)old.observed_at=time;}
 }
 return {add,result:()=>({rows:[...days.values()].map(r=>({kind:r.kind,value:Math.round((r.mode==='mean'?r.value/r.count:r.value)*100)/100,unit:r.unit,observed_at:r.observed_at,device:r.device,aggregation:r.mode==='mean'?'daily mean':r.mode==='sum'?'daily total':'latest daily'})),ignored})};
}
const decode=s=>s.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
export function parseApple(text,collector){
 if(!text.includes('<HealthData')||!text.includes('</HealthData>'))throw Error('This is not a complete Apple Health export.xml file.');
 const types={HKQuantityTypeIdentifierRestingHeartRate:['resting_hr','bpm'],HKQuantityTypeIdentifierHeartRate:['heart_rate','bpm'],HKQuantityTypeIdentifierHeartRateVariabilitySDNN:['hrv_sdnn','ms'],HKQuantityTypeIdentifierRespiratoryRate:['respiratory_rate','breaths/min'],HKQuantityTypeIdentifierBodyMass:['weight','kg','last'],HKQuantityTypeIdentifierLeanBodyMass:['lean_mass','kg','last'],HKQuantityTypeIdentifierBodyFatPercentage:['body_fat','%','last'],HKQuantityTypeIdentifierOxygenSaturation:['spo2','%']};
 for(const match of text.matchAll(/<Record\s+([^>]+)>/g)){
  const a=Object.fromEntries([...match[1].matchAll(/([A-Za-z]+)="([^"]*)"/g)].map(m=>[m[1],decode(m[2])])),t=types[a.type];if(!t)continue;let value=Number(a.value);if(!a.value||!Number.isFinite(value))continue;
  if(['body_fat','spo2'].includes(t[0])){if(a.unit!=='%')continue;value*=100;if(value>100)continue}
  else if(['weight','lean_mass'].includes(t[0])){if(a.unit==='lb')value*=.45359237;else if(a.unit==='g')value/=1000;else if(a.unit!=='kg')continue}
  else if(t[0]==='hrv_sdnn'){if(a.unit==='s')value*=1000;else if(a.unit!=='ms')continue}
  else if(!['count/min','bpm','breaths/min'].includes(a.unit))continue;
  collector.add(t[0],value,t[1],a.endDate||a.startDate,a.sourceName||'Health',t[2]||'mean',a.startDate+'|'+a.endDate+'|'+a.value);
 }
}
export function parseCSV(text){const rows=[];let row=[],cell='',quote=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++}else quote=!quote}else if(c===','&&!quote){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell=''}else cell+=c}if(quote)throw Error('The CSV file has an unclosed quoted field.');if(cell||row.length){row.push(cell);rows.push(row)}const header=rows.shift()?.map(x=>x.trim().toLowerCase().replace(/[^a-z0-9]/g,''))||[];return rows.map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]?.trim()])));}
export function parseFitbit(text,filename,collector,{weightUnit=''}={}){
 let content=filename.toLowerCase().endsWith('.csv')?parseCSV(text):JSON.parse(text);const list=Array.isArray(content)?content:content.dataPoints||content.sleep||content.weight||content.fat||content['activities-heart']||[];
 if(!Array.isArray(list))return;
 for(const r of list){
  const date=r.dateTime||r.datetime||r.date||r.timestamp||r.dateOfSleep||r.endTime,device='Fitbit / Google Health';const add=(k,v,u,d=date,mode='mean',id='')=>collector.add(k,v,u,d,device,mode,id);const val=r.value;
  if(r.sleep){const sleep=r.sleep,time=sleep.interval?.endTime;add('sleep',Number(sleep.summary?.minutesAsleep)/60,'hours',time,'last');for(const stage of sleep.summary?.stagesSummary||[]){const k={DEEP:'sleep_deep',REM:'sleep_rem',LIGHT:'sleep_light',AWAKE:'sleep_awake'}[stage.type];if(k)add(k,Number(stage.minutes)/(k==='sleep_awake'?1:60),k==='sleep_awake'?'min':'hours',time,'last')}}
  if(r.minutesAsleep!==undefined){add(r.isMainSleep===false?'nap':'sleep',Number(r.minutesAsleep)/60,'hours',r.endTime||date,'last');for(const [key,kind] of [['deep','sleep_deep'],['rem','sleep_rem'],['light','sleep_light']])if(r.levels?.summary?.[key]?.minutes!==undefined)add(kind,r.levels.summary[key].minutes/60,'hours',r.endTime||date,'last');}
  if(r.weight?.weightGrams!==undefined)add('weight',r.weight.weightGrams/1000,'kg',r.weight.sampleTime?.physicalTime,'last');
  if(r.bodyFat)add('body_fat',r.bodyFat.percentage,'%',r.bodyFat.sampleTime?.physicalTime,'last');
  if(r.heartRate)add('heart_rate',r.heartRate.beatsPerMinute,'bpm',r.heartRate.sampleTime?.physicalTime);
  if(val?.bpm!==undefined)add('heart_rate',val.bpm,'bpm');
  if(val?.restingHeartRate!==undefined)add('resting_hr',val.restingHeartRate,'bpm');
  if(val?.dailyRmssd!==undefined)add('hrv',val.dailyRmssd,'ms');
  for(const [field,kind,unit] of [['restingheartrate','resting_hr','bpm'],['bpm','heart_rate','bpm'],['rmssd','hrv','ms'],['spo2','spo2','%'],['fat','body_fat','%'],['bodyfat','body_fat','%']])if(r[field]!==undefined&&typeof r[field]!=='object')add(kind,r[field],unit,date,kind==='body_fat'?'last':'mean');
  const weight=r.weightkg??r.weightlbs??(typeof r.weight==='number'||typeof r.weight==='string'?r.weight:undefined);
  if(weight!==undefined&&weight!==''){const unit=r.weightkg!==undefined?'kg':r.weightlbs!==undefined?'lb':r.unit||weightUnit;if(!['kg','lb'].includes(unit))throw Error('This export omits weight units. Choose kg or lb before importing.');add('weight',Number(weight)*(unit==='lb'?.45359237:1),'kg',date,'last');}
 }
}
