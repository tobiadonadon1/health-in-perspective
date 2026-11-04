// Import explicit measured fields only. Original files stay in the browser.
import {zipEntries,readEntry} from './zip-reader.js';
const DAY=86400000;
// Whole history: Apple Health began in 2014, Fitbit in 2009. Anything before 2000 is a broken clock, not a reading.
export const EARLIEST=Date.UTC(2000,0,1);
export function parseDate(value){if(typeof value!=='string')return null;let v=value.trim();if(/^\d{4}-\d{2}-\d{2}$/.test(v))v+='T12:00:00Z';v=v.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/,'$1T$2$3:$4');const m=v.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})(.*)$/);if(m)v=`${m[3].length===2?'20'+m[3]:m[3]}-${m[1]}-${m[2]}${m[4].trim()?'T'+m[4].trim():'T12:00:00'}Z`;const time=Date.parse(v);return Number.isFinite(time)?new Date(time).toISOString():null;}
// 53-bit string hash: on multi-million-sample exports each dedupe key costs one number, not a long string.
function hash53(text){let a=0xdeadbeef,b=0x41c6ce57;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);a=Math.imul(a^c,2654435761);b=Math.imul(b^c,1597334677)}a=Math.imul(a^(a>>>16),2246822507)^Math.imul(b^(b>>>13),3266489909);b=Math.imul(b^(b>>>16),2246822507)^Math.imul(a^(a>>>13),3266489909);return 4294967296*(2097151&b)+(a>>>0)}
// The calendar day as written in the export (the wearer's wall clock). Bucketing by the UTC day would move
// evening samples west of UTC, and early-morning samples east of it, onto the wrong day.
export function wallDay(value){if(typeof value!=='string')return '';const v=value.trim(),iso=v.match(/^(\d{4}-\d{2}-\d{2})/);if(iso)return iso[1];const us=v.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})/);return us?`${us[3].length===2?'20'+us[3]:us[3]}-${us[1]}-${us[2]}`:''}
export function createCollector(now=Date.now()){
 const days=new Map(),seen=new Set(),events=new Map(),behaviors=new Map(),cycleDays=new Map();let ignored=0;
 function add(kind,value,unit,date,device='',mode='mean',identity='',day=''){
  const time=parseDate(date);if(value===null||value===undefined||value===''||!time||Date.parse(time)<EARLIEST||Date.parse(time)>now+DAY||!Number.isFinite(Number(value))||+value<0){ignored++;return}value=+value;device=String(device).slice(0,70);
  const id=hash53([kind,device,identity||time+'|'+value].join('|'));if(seen.has(id))return;seen.add(id);
  const local=day||wallDay(date)||time.slice(0,10),key=[kind,local,device].join('|'),old=days.get(key);
  if(!old)days.set(key,{kind,value,unit,observed_at:time,device,mode,count:1,day:local});
  else{if(mode==='sum')old.value+=value;else if(mode==='last'){if(time>=old.observed_at)old.value=value}else old.value+=value;old.count++;if(time>old.observed_at)old.observed_at=time;}
 }
 // One reading per source record (a WHOOP cycle, sleep or workout), keyed by its stable id: the same record read twice,
 // from two files or two uploads, stays one row.
 function event(kind,value,unit,date,device,external_id,day,extra={}){
  const time=parseDate(date);if(value===null||value===undefined||!time||Date.parse(time)<EARLIEST||Date.parse(time)>now+DAY||!Number.isFinite(+value)||+value<0){ignored++;return false}
  events.set(kind+'|'+external_id,{kind,value:Math.round(value*100)/100,unit,observed_at:time,day,device:String(device).slice(0,70),aggregation:'latest daily',external_id,...extra});return true;
 }
 const dayOK=d=>Date.parse(d+'T12:00:00Z')>=EARLIEST&&Date.parse(d+'T00:00:00Z')<=now+DAY;
 return {add,event,behavior:b=>behaviors.set(b.external_id,b),cycleDay:(start,day)=>cycleDays.set(start,day),result:()=>({rows:[...[...days.values()].map(r=>({kind:r.kind,value:Math.round((r.mode==='mean'?r.value/r.count:r.value)*100)/100,unit:r.unit,observed_at:r.observed_at,day:r.day,device:r.device,aggregation:r.mode==='mean'?'daily mean':r.mode==='sum'?'daily total':'latest daily'})),...events.values()],
  // A journal answer belongs to its cycle's day, the same day as that cycle's recovery and strain.
  behaviors:[...behaviors.values()].map(({cycle,...b})=>({...b,day:cycleDays.get(cycle)||b.day})).filter(b=>dayOK(b.day)),ignored})};
}
const decode=s=>s.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const appleTypes={HKQuantityTypeIdentifierRestingHeartRate:['resting_hr','bpm'],HKQuantityTypeIdentifierHeartRate:['heart_rate','bpm'],HKQuantityTypeIdentifierHeartRateVariabilitySDNN:['hrv_sdnn','ms'],HKQuantityTypeIdentifierRespiratoryRate:['respiratory_rate','breaths/min'],HKQuantityTypeIdentifierBodyMass:['weight','kg','last'],HKQuantityTypeIdentifierLeanBodyMass:['lean_mass','kg','last'],HKQuantityTypeIdentifierBodyFatPercentage:['body_fat','%','last'],HKQuantityTypeIdentifierOxygenSaturation:['spo2','%'],HKQuantityTypeIdentifierStepCount:['steps','','sum'],HKQuantityTypeIdentifierAppleSleepingWristTemperature:['skin_temperature','°C'],HKCategoryTypeIdentifierSleepAnalysis:['sleep','hours','sum']};
const sleepStages={HKCategoryValueSleepAnalysisAsleepCore:'sleep_light',HKCategoryValueSleepAnalysisAsleepDeep:'sleep_deep',HKCategoryValueSleepAnalysisAsleepREM:'sleep_rem',HKCategoryValueSleepAnalysisAsleepUnspecified:'',HKCategoryValueSleepAnalysisAsleep:'',HKCategoryValueSleepAnalysisAwake:'sleep_awake'};
const attributes=tag=>Object.fromEntries([...tag.matchAll(/([A-Za-z]+)="([^"]*)"/g)].map(m=>[m[1],decode(m[2])]));
// A night belongs to the local calendar day it ends on: shift wall-clock time by six hours.
export function sleepNight(value){const m=typeof value==='string'&&value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);if(!m)return '';return new Date(Date.UTC(+m[1],m[2]-1,+m[3],+m[4]+6,+m[5])).toISOString().slice(0,10)}
function appleRecord(a,collector){
 const t=appleTypes[a.type];if(!t)return;const device=a.sourceName||'Health';
 if(t[0]==='sleep'){
  const stage=sleepStages[a.value];if(stage===undefined)return;const hours=(Date.parse(parseDate(a.endDate)||'')-Date.parse(parseDate(a.startDate)||''))/3600000;if(!Number.isFinite(hours)||hours<=0||hours>24)return;
  const night=sleepNight(a.endDate),id=a.startDate+'|'+a.endDate+'|'+a.value;
  if(stage==='sleep_awake')collector.add('sleep_awake',hours*60,'min',a.endDate,device,'sum',id,night);
  else{collector.add('sleep',hours,'hours',a.endDate,device,'sum',id,night);if(stage)collector.add(stage,hours,'hours',a.endDate,device,'sum',id,night)}
  return;
 }
 let value=Number(a.value);if(!a.value||!Number.isFinite(value))return;
 if(['body_fat','spo2'].includes(t[0])){if(a.unit!=='%')return;value*=100;if(value>100)return}
 else if(['weight','lean_mass'].includes(t[0])){if(a.unit==='lb')value*=.45359237;else if(a.unit==='g')value/=1000;else if(a.unit!=='kg')return}
 else if(t[0]==='hrv_sdnn'){if(a.unit==='s')value*=1000;else if(a.unit!=='ms')return}
 else if(t[0]==='steps'){if(a.unit!=='count')return}
 else if(t[0]==='skin_temperature'){if(a.unit==='degF')value=(value-32)*5/9;else if(a.unit!=='degC')return;if(value<20||value>45)return}
 else if(!['count/min','bpm','breaths/min'].includes(a.unit))return;
 collector.add(t[0],value,t[1],a.endDate||a.startDate,device,t[2]||'mean',a.startDate+'|'+a.endDate+'|'+a.value);
}
function activitySummary(a,collector){
 // Apple's own daily ring totals avoid double-counting iPhone and Watch energy samples.
 if(!/^\d{4}-\d{2}-\d{2}$/.test(a.dateComponents||''))return;let value=Number(a.activeEnergyBurned);if(!a.activeEnergyBurned||!Number.isFinite(value))return;
 if(a.activeEnergyBurnedUnit==='kJ')value/=4.184;else if(a.activeEnergyBurnedUnit&&a.activeEnergyBurnedUnit!=='kcal'&&a.activeEnergyBurnedUnit!=='Cal')return;
 collector.add('active_energy',value,'kcal',a.dateComponents,'Apple Watch','last',a.dateComponents);
}
// Streams an export.xml of any size: feed text chunks with push(), then call end().
export function createAppleParser(collector){
 let buffer='',started=false,finished=false;
 function scan(final){
  let pos=0;
  while(true){
   const open=buffer.indexOf('<',pos);if(open<0){pos=buffer.length;break}
   const close=buffer.indexOf('>',open);if(close<0){pos=open;break}
   const name=buffer.slice(open+1,open+16);
   if(name.startsWith('Record ')||name.startsWith('Record\t')||name.startsWith('Record\n'))appleRecord(attributes(buffer.slice(open+7,close)),collector);
   else if(name.startsWith('ActivitySummary'))activitySummary(attributes(buffer.slice(open+16,close)),collector);
   else if(name.startsWith('HealthData'))started=true;
   else if(name.startsWith('/HealthData'))finished=true;
   pos=close+1;
  }
  buffer=final?'':buffer.slice(pos);
  if(buffer.length>1048576)throw Error('This Apple Health export contains an unreadable record.');
 }
 return {push(text){buffer+=text;scan(false)},end(){scan(true);if(!started||!finished)throw Error('This is not a complete Apple Health export.xml file.')}};
}
export function parseApple(text,collector){const parser=createAppleParser(collector);parser.push(text);parser.end()}
export function parseCSV(text){text=String(text).replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quote=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++}else quote=!quote}else if(c===','&&!quote){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell=''}else cell+=c}if(quote)throw Error('The CSV file has an unclosed quoted field.');if(cell||row.length){row.push(cell);rows.push(row)}const header=rows.shift()?.map(x=>x.trim().toLowerCase().replace(/[^a-z0-9]/g,''))||[];return rows.map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]?.trim()])));}
export function parseFitbit(text,filename,collector,{weightUnit=''}={}){
 let content=filename.toLowerCase().endsWith('.csv')?parseCSV(text):JSON.parse(text);const list=Array.isArray(content)?content:content.dataPoints||content.sleep||content.weight||content.fat||content['activities-heart']||[];
 if(!Array.isArray(list))return;
 for(const r of list){
  const date=r.dateTime||r.datetime||r.date||r.timestamp||r.dateOfSleep||r.endTime,device='Fitbit / Google Health';const add=(k,v,u,d=date,mode='mean',id='')=>collector.add(k,v,u,d,device,mode,id);const val=r.value;
  if(r.sleep){const sleep=r.sleep,time=sleep.interval?.endTime;add('sleep',Number(sleep.summary?.minutesAsleep)/60,'hours',time,'last');for(const stage of sleep.summary?.stagesSummary||[]){const k={DEEP:'sleep_deep',REM:'sleep_rem',LIGHT:'sleep_light',AWAKE:'sleep_awake'}[stage.type];if(k)add(k,Number(stage.minutes)/(k==='sleep_awake'?1:60),k==='sleep_awake'?'min':'hours',time,'last')}}
  if(r.minutesAsleep!==undefined){add(r.isMainSleep===false||r.mainSleep===false?'nap':'sleep',Number(r.minutesAsleep)/60,'hours',r.endTime||date,'last');for(const [key,kind] of [['deep','sleep_deep'],['rem','sleep_rem'],['light','sleep_light']])if(r.levels?.summary?.[key]?.minutes!==undefined)add(kind,r.levels.summary[key].minutes/60,'hours',r.endTime||date,'last');}
  if(r.weight?.weightGrams!==undefined)add('weight',r.weight.weightGrams/1000,'kg',r.weight.sampleTime?.physicalTime,'last');
  if(r.bodyFat)add('body_fat',r.bodyFat.percentage,'%',r.bodyFat.sampleTime?.physicalTime,'last');
  if(r.heartRate)add('heart_rate',r.heartRate.beatsPerMinute,'bpm',r.heartRate.sampleTime?.physicalTime);
  if(val?.bpm!==undefined)add('heart_rate',val.bpm,'bpm');
  if(val?.restingHeartRate!==undefined)add('resting_hr',val.restingHeartRate,'bpm');
  // Takeout resting_heart_rate files nest the reading as value.value; 0 marks a day without a reading.
  else if(/resting_heart_rate/i.test(filename)&&Number(val?.value)>0)add('resting_hr',val.value,'bpm');
  if(val?.dailyRmssd!==undefined)add('hrv',val.dailyRmssd,'ms');
  for(const [field,kind,unit] of [['restingheartrate','resting_hr','bpm'],['bpm','heart_rate','bpm'],['rmssd','hrv','ms'],['spo2','spo2','%'],['fat','body_fat','%'],['bodyfat','body_fat','%']])if(r[field]!==undefined&&typeof r[field]!=='object')add(kind,r[field],unit,date,kind==='body_fat'?'last':'mean');
  const weight=r.weightkg??r.weightlbs??(typeof r.weight==='number'||typeof r.weight==='string'?r.weight:undefined);
  if(weight!==undefined&&weight!==''){const unit=r.weightkg!==undefined?'kg':r.weightlbs!==undefined?'lb':r.unit||weightUnit;if(!['kg','lb'].includes(unit))throw Error('This export omits weight units. Choose kg or lb before importing.');add('weight',Number(weight)*(unit==='lb'?.45359237:1),'kg',date,'last');}
 }
}
// WHOOP data export: a zip WHOOP emails you, holding physiological_cycles.csv (one row per WHOOP cycle: recovery, strain
// and that night's sleep), sleeps.csv (one row per sleep or nap), workouts.csv and journal_entries.csv.
// Columns are found by their words, never their position, so reordered or extra columns and unit variants ("(cal)",
// "(kcal)", "(fahrenheit)") still import. Each reading carries a stable id built from its cycle's, sleep's or workout's
// START time in UTC, so uploading the same or a newer export again updates rows instead of duplicating them.
// Cycles and nights are filed on the day you woke up, as the live WHOOP connection does, under the kinds and units it uses.
export const WHOOP_CSV=['physiological_cycles.csv','sleeps.csv','workouts.csv','journal_entries.csv'];
export class WhoopFileError extends Error{constructor(message,code){super(message);this.name='WhoopFileError';this.code=code}}
const base=name=>String(name||'file').split(/[\\/]/).pop();
// RFC 4180 CSV: quoted fields may hold commas, quotes ("") and line breaks; CRLF or LF; a leading BOM is dropped.
export function readCSV(text){
 text=String(text).replace(/^﻿/,'');const rows=[],lines=[];let row=[],cell='',quote=false,quoted=false,line=1,start=1;
 const push=()=>{row.push(quoted?cell:cell.trim());if(row.some(x=>x!==''))rows.push(row),lines.push(start);row=[];cell='';quoted=false};
 for(let i=0;i<text.length;i++){const c=text[i];
  if(quote){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else quote=false}else{if(c==='\n')line++;cell+=c}continue}
  if(c==='"'&&!quoted&&cell.trim()===''){quote=true;quoted=true;cell=''}
  else if(c===','){row.push(quoted?cell:cell.trim());cell='';quoted=false}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;push();line++;start=line}
  else if(!quoted)cell+=c;
 }
 if(quote)throw Object.assign(Error('A quoted field never closes.'),{line:start});
 push();return {rows,lines,endsWithNewline:/[\r\n]$/.test(text)};
}
// Wall-clock fields of a WHOOP timestamp: "2026-10-29 23:10:00", ISO 8601 (optionally with Z or an offset), or the
// "10/29/2026 11:10 PM" a spreadsheet writes when the file was opened and saved again.
function localFields(value){
 if(typeof value!=='string')return null;const v=value.trim();let m=v.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/i);
 if(m)return {y:+m[1],mo:+m[2],d:+m[3],h:+m[4],mi:+m[5],s:+(m[6]||0),zone:m[7]||''};
 m=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i);if(!m)return null;
 let h=+m[4];if(m[7]){h%=12;if(/^p/i.test(m[7]))h+=12}return {y:+m[3],mo:+m[1],d:+m[2],h,mi:+m[5],s:+(m[6]||0),zone:''};
}
// Minutes east of UTC for "UTC+01:00", "-0500", "GMT-5" or an IANA name such as "Europe/Rome". Unknown zones count as UTC:
// the day a reading is filed on comes from the wall clock either way.
function zoneMinutes(zone,local){
 const z=String(zone||'').trim();if(!z||/^(utc|gmt|z)$/i.test(z))return 0;
 const m=z.match(/^(?:utc|gmt)?\s*([+-])(\d{1,2})(?::?(\d{2}))?$/i);if(m)return (m[1]==='-'?-1:1)*(+m[2]*60+ +(m[3]||0));
 try{const f=new Intl.DateTimeFormat('en-US',{timeZone:z,hourCycle:'h23',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric'});
  const at=ms=>{const p=Object.fromEntries(f.formatToParts(ms).map(x=>[x.type,x.value]));return Math.round((Date.UTC(+p.year,p.month-1,+p.day,+p.hour%24,+p.minute)-Math.floor(ms/60000)*60000)/60000)};
  return at(local-at(local)*60000)}catch{return 0}
}
// {utc, local, day}: the instant in UTC, the wall clock as a UTC-based number, and the calendar day on the wearer's clock.
function whoopMoment(value,zone=''){
 const f=localFields(value);if(!f||f.mo<1||f.mo>12||f.d<1||f.d>31||f.h>23||f.mi>59||f.s>59)return null;const local=Date.UTC(f.y,f.mo-1,f.d,f.h,f.mi,f.s);
 return {utc:new Date(local-zoneMinutes(f.zone||zone,local)*60000).toISOString(),local,day:new Date(local).toISOString().slice(0,10)};
}
export function whoopTime(value,zone=''){return whoopMoment(value,zone)?.utc||null}
const stamp=iso=>iso.replace(/\.\d{3}Z$/,'Z'),shiftDay=(m,hours)=>new Date(m.local+hours*3600000).toISOString().slice(0,10);
// Units come from the header's parentheses: "Energy burned (cal)" is WHOOP's food calorie, i.e. kcal.
const unitOf=h=>((h.match(/\(([^)]*)\)/)||[])[1]||(h.trim().endsWith('%')?'%':'')).trim().toLowerCase();
const toMinutes=(u,v)=>/^(ms|milli|millis|milliseconds?)$/.test(u)?v/60000:/^(s|secs?|seconds?)$/.test(u)?v/60:/^(h|hrs?|hours?)$/.test(u)?v*60:v;
const toKcal=(u,v)=>/kj|kilojoule/.test(u)?v/4.184:v;
const toCelsius=(u,v)=>/^(°?f|degf|fahrenheit)$/.test(u)||(!/c/.test(u)&&v>=80&&v<=115)?(v-32)*5/9:v;
// Same ceilings as the server (imports.mjs): a value outside them is skipped here instead of failing the whole batch.
const WHOOP_MAX={recovery:100,resting_hr:300,hrv:2000,spo2:100,skin_temperature:45,strain:21,energy_burned:20000,heart_rate:300,sleep:24,nap:24,sleep_light:24,sleep_deep:24,sleep_rem:24,sleep_awake:1440,respiratory_rate:100,sleep_performance:100,sleep_efficiency:100,sleep_consistency:100,sleep_debt:1440,sleep_needed:24,sleep_disturbances:1000,workout:1440,workout_strain:21,workout_energy:10000,workout_avg_hr:300,workout_max_hr:300};
function whoopColumns(header){
 const keys=header.map(h=>h.toLowerCase().replace(/[^a-z0-9]/g,'')),find=(...alts)=>{for(const words of alts){const i=keys.findIndex(k=>words.every(w=>k.includes(w)));if(i>=0)return i}return -1};
 return {keys,unit:i=>i<0?'':unitOf(header[i]),cycleStart:find(['cycle','start']),cycleEnd:find(['cycle','end']),zone:find(['timezone'],['zone']),
  onset:find(['sleep','onset'],['onset'],['sleep','start']),wake:find(['wake','onset'],['wake'],['sleep','end']),
  recovery:find(['recovery']),rhr:find(['resting','heart'],['rhr']),hrv:find(['heartratevariability'],['hrv']),skin:find(['skin','temp','celsius'],['skin','temp']),spo2:find(['bloodoxygen'],['spo2'],['oxygen']),
  dayStrain:find(['day','strain']),energy:find(['energy'],['calorie'],['kilojoule']),avgHr:find(['average','hr'],['average','heart'],['avg','hr']),maxHr:find(['max','hr'],['max','heart']),
  resp:find(['respiratory']),asleep:find(['asleep']),light:find(['light']),deep:find(['deep'],['sws']),rem:keys.findIndex(k=>k.startsWith('rem')),awake:find(['awake']),
  performance:find(['sleep','performance']),efficiency:find(['efficiency']),consistency:find(['consistency']),debt:find(['debt']),need:find(['need']),disturbances:find(['disturbance']),nap:keys.findIndex(k=>k==='nap'||k==='isnap'),
  workoutStart:find(['workout','start']),workoutEnd:find(['workout','end']),duration:keys.findIndex(k=>k.startsWith('duration')),activity:find(['activity','name'],['sport'],['activity','type']),strain:find(['activity','strain'],['strain']),
  question:find(['question']),answer:find(['answered'],['answer']),notes:find(['note'])};
}
const WHOOP_TYPES={cycles:'physiological_cycles.csv',sleeps:'sleeps.csv',workouts:'workouts.csv',journal:'journal_entries.csv'};
const REQUIRED={cycles:[['cycleStart','Cycle start time'],[['recovery','dayStrain','hrv','rhr'],'Recovery score % or Day Strain']],sleeps:[['onset','Sleep onset'],['wake','Wake onset'],['asleep','Asleep duration (min)']],
 workouts:[['workoutStart','Workout start time'],[['duration','workoutEnd'],'Duration (min)']],journal:[['cycleStart','Cycle start time'],['question','Question text'],['answer','Answered yes']]};
const EXPECTED={cycles:'Cycle start time, Cycle timezone, Recovery score %, Resting heart rate (bpm), Heart rate variability (ms), Day Strain and Sleep onset',sleeps:'Cycle start time, Sleep onset, Wake onset, Asleep duration (min), Deep (SWS) duration (min) and Nap',
 workouts:'Cycle start time, Workout start time, Workout end time, Duration (min), Activity name, Activity Strain and Energy burned (cal)',journal:'Cycle start time, Cycle timezone, Question text, Answered yes and Notes'};
function whoopType(name,c){
 const n=name.toLowerCase();if(/journal/.test(n))return 'journal';if(/workout/.test(n))return 'workouts';if(/physiological|cycle/.test(n))return 'cycles';if(/sleep/.test(n))return 'sleeps';
 // A renamed file is recognised by its columns.
 if(c.question>=0&&c.answer>=0)return 'journal';if(c.workoutStart>=0)return 'workouts';if(c.recovery>=0||c.dayStrain>=0)return 'cycles';if(c.onset>=0&&c.asleep>=0)return 'sleeps';return null;
}
const list=(words,and='and')=>words.length<2?words.join(''):words.slice(0,-1).join(', ')+` ${and} `+words.at(-1);
// Reads one WHOOP CSV into the collector. Returns {name,type,rows,measurements}; throws a WhoopFileError a person can act on.
export function parseWhoop(text,filename,collector,stats={cycles:new Set(),sleeps:new Set(),workouts:new Set()}){
 const name=base(filename);
 if(!String(text??'').replace(/^﻿/,'').trim())throw new WhoopFileError(`${name} is empty. Download the export from WHOOP again.`,'empty');
 let csv;try{csv=readCSV(text)}catch(e){throw new WhoopFileError(`${name} looks cut off or damaged: the quoted value starting on line ${e.line} never ends. Download the export from WHOOP again.`,'damaged')}
 const [header=[],...rows]=csv.rows,c=whoopColumns(header),type=whoopType(name,c);
 const notWhoop=()=>new WhoopFileError(`${name} isn’t part of a WHOOP export. Choose the zip WHOOP emailed you, or its ${list(WHOOP_CSV,'or')} file.`,'not_whoop');
 if(!type)throw notWhoop();
 const missing=REQUIRED[type].filter(([k])=>[].concat(k).every(x=>c[x]<0)).map(([,label])=>label);
 if(missing.length){if(!c.keys.some(k=>k.includes('cycle')))throw notWhoop();throw new WhoopFileError(`${name} is missing ${missing.length>1?'the columns':'the column'} ${list(missing)}. WHOOP’s ${WHOOP_TYPES[type]} has columns such as ${EXPECTED[type]}. Download a fresh export from WHOOP and try again.`,'columns')}
 const short=rows.length&&rows.at(-1).length<header.length&&!csv.endsWithNewline;
 if(short)throw new WhoopFileError(`${name} looks cut off: its last line (line ${csv.lines.at(-1)}) has ${rows.at(-1).length} of ${header.length} columns. Download the export from WHOOP again.`,'truncated');
 const cell=(r,i)=>i<0?'':String(r[i]??'').trim(),num=(r,i)=>{const v=cell(r,i).replace(/\s*%$/,'');return v!==''&&Number.isFinite(+v)?+v:null};
 const at=(r,i)=>whoopMoment(cell(r,i),cell(r,c.zone)),mins=(r,i)=>{const v=num(r,i);return v===null?null:toMinutes(c.unit(i),v)},hours=(r,i)=>{const v=mins(r,i);return v===null?null:v/60};
 let parsed=0,measurements=0;
 const add=(kind,value,unit,when,id,day,extra)=>{if(value===null||!Number.isFinite(value)||value<0||value>WHOOP_MAX[kind])return 0;if(!collector.event(kind,value,unit,when,'WHOOP',id,day,extra))return 0;measurements++;return 1};
 const night=(r,id,day,when)=>add('sleep',hours(r,c.asleep),'hours',when,id,day)+add('sleep_light',hours(r,c.light),'hours',when,id,day)+add('sleep_deep',hours(r,c.deep),'hours',when,id,day)+add('sleep_rem',hours(r,c.rem),'hours',when,id,day)
  +add('sleep_awake',mins(r,c.awake),'min',when,id,day)+add('respiratory_rate',num(r,c.resp),'breaths/min',when,id,day)+add('sleep_performance',num(r,c.performance),'%',when,id,day)+add('sleep_efficiency',num(r,c.efficiency),'%',when,id,day)
  +add('sleep_consistency',num(r,c.consistency),'%',when,id,day)+add('sleep_debt',mins(r,c.debt),'min',when,id,day)+add('sleep_needed',hours(r,c.need),'hours',when,id,day)+add('sleep_disturbances',num(r,c.disturbances),'',when,id,day);
 for(const r of rows){
  if(type==='cycles'){
   const start=at(r,c.cycleStart);if(!start)continue;parsed++;
   // A cycle starts when you fall asleep, usually the evening before: it belongs to the day you woke up.
   const wake=at(r,c.wake),onset=at(r,c.onset),end=at(r,c.cycleEnd),day=wake?.day||shiftDay(start,6),when=wake?.utc||end?.utc||start.utc,id='whoop:cycle:'+stamp(start.utc);
   collector.cycleDay(stamp(start.utc),day);const skin=num(r,c.skin);
   const n=add('recovery',num(r,c.recovery),'%',when,id,day)+add('resting_hr',num(r,c.rhr),'bpm',when,id,day)+add('hrv',num(r,c.hrv),'ms',when,id,day)+add('spo2',num(r,c.spo2),'%',when,id,day)
    +add('skin_temperature',skin===null?null:toCelsius(c.unit(c.skin),skin),'°C',when,id,day)+add('strain',num(r,c.dayStrain),'',when,id,day)
    +add('energy_burned',num(r,c.energy)===null?null:toKcal(c.unit(c.energy),num(r,c.energy)),'kcal',when,id,day)+add('heart_rate',num(r,c.avgHr),'bpm',when,id,day);
   if(n)stats.cycles.add(id);
   // The night inside this cycle is the same record as its row in sleeps.csv: same id, so it is kept once.
   const sid=onset?'whoop:sleep:'+stamp(onset.utc):id;if(night(r,sid,wake?.day||(onset?shiftDay(onset,6):day),wake?.utc||onset?.utc||when))stats.sleeps.add(sid);
  }else if(type==='sleeps'){
   const onset=at(r,c.onset);if(!onset)continue;parsed++;const wake=at(r,c.wake),id='whoop:sleep:'+stamp(onset.utc),day=wake?.day||shiftDay(onset,6),when=wake?.utc||onset.utc;
   if(/^(true|yes|y|1)$/i.test(cell(r,c.nap))?add('nap',hours(r,c.asleep),'hours',when,id,day):night(r,id,day,when))stats.sleeps.add(id);
  }else if(type==='workouts'){
   const start=at(r,c.workoutStart);if(!start)continue;parsed++;const end=at(r,c.workoutEnd),id='whoop:workout:'+stamp(start.utc),label=cell(r,c.activity).slice(0,100),extra=label?{label}:{},energy=num(r,c.energy);
   let minutes=mins(r,c.duration);if(minutes===null&&end)minutes=(Date.parse(end.utc)-Date.parse(start.utc))/60000;
   // A workout is filed at its start time, on the day it started.
   const n=add('workout',minutes,'min',start.utc,id,start.day,extra)+add('workout_strain',num(r,c.strain),'',start.utc,id,start.day,extra)+add('workout_energy',energy===null?null:toKcal(c.unit(c.energy),energy),'kcal',start.utc,id,start.day,extra)
    +add('workout_avg_hr',num(r,c.avgHr),'bpm',start.utc,id,start.day,extra)+add('workout_max_hr',num(r,c.maxHr),'bpm',start.utc,id,start.day,extra);
   if(n)stats.workouts.add(id);
  }else{
   const start=at(r,c.cycleStart),question=cell(r,c.question).replace(/\s+/g,' ').slice(0,200),answer=cell(r,c.answer),yes=/^(true|yes|y|1)$/i.test(answer);
   if(!start||!question||!(yes||/^(false|no|n|0)$/i.test(answer)))continue;parsed++;const cycle=stamp(start.utc);
   collector.behavior({external_id:`whoop:journal:${cycle}:${hash53(question.toLowerCase()).toString(36)}`,day:shiftDay(start,6),cycle,question,answered_yes:yes,notes:cell(r,c.notes).slice(0,1000)});
  }
 }
 return {name,type,rows:parsed,measurements};
}
// Reads several WHOOP CSVs ({name,text,zip?}) into rows for wearable-import, behaviours for wearable-import-behaviors and
// a preview: counts per file type and per measurement, and the date range. Unrelated or empty CSVs inside a zip are skipped.
export function readWhoopFiles(entries,{now=Date.now()}={}){
 const collector=createCollector(now),stats={cycles:new Set(),sleeps:new Set(),workouts:new Set()},files=[],skipped=[];
 for(const e of entries){try{files.push(parseWhoop(e.text,e.name,collector,stats))}catch(error){if(e.zip&&['not_whoop','empty'].includes(error.code)){skipped.push(base(e.name));continue}throw error}}
 if(!files.length)throw new WhoopFileError(`No WHOOP CSV files were found. The zip WHOOP emails you contains ${list(WHOOP_CSV)}.`,'no_csv');
 const {rows,behaviors}=collector.result();
 if(!rows.length&&!behaviors.length)throw new WhoopFileError('These WHOOP files have no measurements or journal answers in them yet. Wear your WHOOP for a day, request a new export, then upload it.','no_data');
 const kinds={};for(const r of rows)kinds[r.kind]=(kinds[r.kind]||0)+1;
 const days=[...rows.map(r=>r.day),...behaviors.map(b=>b.day)].filter(Boolean).sort();
 return {rows,behaviors,preview:{files,skipped,counts:{cycles:stats.cycles.size,sleeps:stats.sleeps.size,workouts:stats.workouts.size,journal:behaviors.length},kinds,measurements:rows.length,first_day:days[0]||null,last_day:days.at(-1)||null}};
}
const MAX_WHOOP_CSV=200*1024*1024;
// Opens what a person chose (the WHOOP zip and/or loose CSVs, as File/Blob objects) and reads it with readWhoopFiles.
export async function readWhoopUploads(files,{onProgress=()=>{},now=Date.now()}={}){
 const entries=[],total=files.reduce((s,f)=>s+f.size,0)||1,decoder=()=>new TextDecoder('utf-8');let done=0;
 for(const file of files){
  const name=base(file.name),head=new Uint8Array(await file.slice(0,4).arrayBuffer()),zip=(head[0]===0x50&&head[1]===0x4b&&(head[2]===3||head[2]===5))||/\.zip$/i.test(name);
  if(!file.size)throw new WhoopFileError(`${name} is empty. Download the export from WHOOP again.`,'empty');
  if(zip){
   const damaged=()=>new WhoopFileError(`${name} isn’t a readable zip archive. It may be damaged or not fully downloaded: download the export from WHOOP again.`,'bad_zip');
   let list;try{list=await zipEntries(file)}catch{throw damaged()}
   const csvs=list.filter(e=>/\.csv$/i.test(e.name)&&!/(^|\/)__MACOSX\//.test(e.name)&&!base(e.name).startsWith('.'));
   if(!csvs.length)throw new WhoopFileError(`${name} has no WHOOP CSV files in it. The zip WHOOP emails you contains ${WHOOP_CSV.join(', ')}.`,'no_csv');
   let index=0;for(const entry of csvs){
    if(entry.size>MAX_WHOOP_CSV)throw new WhoopFileError(`${base(entry.name)} is too large to read here.`,'too_large');
    const parts=[];let length=0;try{await readEntry(file,entry,chunk=>{parts.push(chunk);length+=chunk.length})}catch{throw damaged()}
    const bytes=new Uint8Array(length);let o=0;for(const p of parts){bytes.set(p,o);o+=p.length}
    entries.push({name:base(entry.name),text:decoder().decode(bytes),zip:name});onProgress(Math.min(1,(done+file.size*++index/csvs.length)/total));
   }
  }else if(/\.csv$/i.test(name)||/csv/.test(file.type||'')){
   if(file.size>MAX_WHOOP_CSV)throw new WhoopFileError(`${name} is too large to read here.`,'too_large');
   const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.subarray(0,4096).includes(0))throw new WhoopFileError(`${name} isn’t a plain-text CSV file. Upload the CSV exactly as WHOOP sent it.`,'not_csv');
   entries.push({name,text:decoder().decode(bytes)});
  }else throw new WhoopFileError(`${name} isn’t a CSV or zip file. Choose the zip WHOOP emailed you, or the CSV files inside it.`,'not_csv');
  done+=file.size;onProgress(Math.min(1,done/total));
 }
 const result=readWhoopFiles(entries,{now});result.preview.uploads=files.map(f=>base(f.name));return result;
}
