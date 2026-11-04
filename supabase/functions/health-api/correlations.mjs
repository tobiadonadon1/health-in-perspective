// Cross-wearable correlations (Xeyo Pro). Pure and dependency-free so it runs in Node tests and the Deno edge function.
// Every finding compares two groups of the member's own days and says how they differ; it never claims a cause and
// never fills gaps: an insight without enough days becomes a `missing` entry telling the member what would unlock it.
const DAY=86400000;
export const MIN_PER_GROUP=5,LATE_HOUR=19,SHORT_SLEEP_HOURS=6,MIN_WORKOUT_MINUTES=10;
// Canonical unit per kind (as imports.mjs and whoop.mjs store them) and how one source's readings on one day combine.
// A reading in any other unit is skipped, never converted or mixed. HRV RMSSD (`hrv`) and SDNN (`hrv_sdnn`) are different
// measures and stay separate kinds: an analysis uses one of them, never a blend. Sleep and daily totals take the day's
// largest value per source, so a nap or a re-synced cumulative total is not added on top of the main reading.
const KINDS={recovery:['%','mean'],hrv:['ms','mean'],hrv_sdnn:['ms','mean'],resting_hr:['bpm','mean'],spo2:['%','mean'],respiratory_rate:['breaths/min','mean'],
 sleep:['hours','max'],sleep_deep:['hours','max'],sleep_rem:['hours','max'],sleep_light:['hours','max'],sleep_awake:['min','max'],
 strain:['','max'],energy_burned:['kcal','max'],active_energy:['kcal','max'],steps:['','max']};
const WORKOUT_UNITS=new Set(['min','minutes','']);
// Live WHOOP files a physiological cycle (its day strain and calories) at the cycle's end, which is the next sleep onset,
// late that evening or after midnight. Six hours earlier lands it back on the day it measured.
const CYCLE_KINDS=new Set(['strain','energy_burned','heart_rate']);
// When two sources recorded the same measure on the same day, the first in this order is used, so a day never averages
// two devices. Live connections come before file imports of the same brand; manual entries come last.
export const SOURCE_ORDER=['WHOOP','WHOOP import','Garmin','Fitbit','Fitbit import','Apple Health import','other sources','Manual entry'];
const RANKS=[[/^WHOOP$/,0],[/^WHOOP import/,1],[/^Garmin/,2],[/^Fitbit$/,3],[/^Fitbit import/,4],[/^Apple Health import/,5],[/^Manual entry/,7]];
export const sourceRank=source=>{for(const [re,rank] of RANKS)if(re.test(source))return rank;return 6};
const compareSources=(a,b)=>sourceRank(a)-sourceRank(b)||(a<b?-1:a>b?1:0);
export function sourceFamily(source){const s=String(source||'');if(/^WHOOP/i.test(s))return 'WHOOP';if(/^Garmin/i.test(s))return 'Garmin';if(/^Fitbit/i.test(s))return 'Fitbit';if(/^Apple Health/i.test(s))return 'Apple Health';if(/^Manual/i.test(s))return 'Manual entry';return s.split(' · ')[0].slice(0,40)||'Other'}

// Local calendar day and minute of day in the member's time zone (Intl works the same in Node and Deno).
const formatters=new Map();
function formatter(timeZone){let f=formatters.get(timeZone);if(!f){f=new Intl.DateTimeFormat('en-US',{timeZone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});formatters.set(timeZone,f)}return f}
export function safeZone(timeZone){if(typeof timeZone!=='string'||!timeZone||timeZone.length>64)return 'UTC';try{formatter(timeZone);return timeZone}catch{return 'UTC'}}
export function localParts(time,timeZone){const o={};for(const p of formatter(timeZone).formatToParts(new Date(time)))o[p.type]=p.value;return {day:`${o.year}-${o.month}-${o.day}`,minutes:(Number(o.hour)%24)*60+Number(o.minute)}}
export const addDays=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);

// One value per kind and local day, from one preferred source; plus each evening's workouts.
export function dailyData(readings,{timeZone='UTC',now=Date.now(),days=365}={}){
 const zone=safeZone(timeZone),from=now-days*DAY,perSource=new Map(),workoutsBySource=new Map(),seen=new Set();let skipped=0;
 for(const r of readings||[]){
  const time=Date.parse(r?.observed_at),value=Number(r?.value);if(r?.value==null||r.value===''||!Number.isFinite(value)||!Number.isFinite(time)||time>now||time<from)continue;
  const source=String(r.source||'Unknown'),unit=r.unit??'';
  if(r.kind==='workout'){
   if(!WORKOUT_UNITS.has(unit)){skipped++;continue}if(value<MIN_WORKOUT_MINUTES)continue;seen.add(sourceFamily(source));
   // observed_at is the workout start. A start between midnight and 4 am finishes a late evening, so it counts for the
   // evening before: the next morning's readings follow it.
   const {day,minutes}=localParts(time,zone),early=minutes<4*60,evening=early?addDays(day,-1):day,key=evening+'|'+source;
   const w=workoutsBySource.get(key)||{day:evening,source,count:0,late:false};w.count++;if(early||minutes>=LATE_HOUR*60)w.late=true;workoutsBySource.set(key,w);continue;
  }
  const rule=KINDS[r.kind];if(!rule)continue;if(unit!==rule[0]){skipped++;continue}seen.add(sourceFamily(source));
  // Fitbit and Garmin stamp daily summaries at exactly 12:00 UTC of their calendar date; that date is the day, in any zone.
  const day=time%DAY===DAY/2?new Date(time).toISOString().slice(0,10):localParts(source==='WHOOP'&&CYCLE_KINDS.has(r.kind)?time-6*3600000:time,zone).day,key=r.kind+'|'+day+'|'+source,old=perSource.get(key);
  if(!old)perSource.set(key,{kind:r.kind,day,source,sum:value,n:1,max:value});else{old.sum+=value;old.n++;old.max=Math.max(old.max,value)}
 }
 const series=new Map();
 for(const e of perSource.values()){
  const value=KINDS[e.kind][1]==='max'?e.max:e.sum/e.n;let byDay=series.get(e.kind);if(!byDay)series.set(e.kind,byDay=new Map());const cur=byDay.get(e.day);
  if(!cur)byDay.set(e.day,{value,source:e.source,others:[]});else if(compareSources(e.source,cur.source)<0)byDay.set(e.day,{value,source:e.source,others:[...cur.others,cur.source]});else cur.others.push(e.source);
 }
 const workouts=new Map();
 for(const w of workoutsBySource.values()){const cur=workouts.get(w.day);if(!cur)workouts.set(w.day,{...w,others:[]});else if(compareSources(w.source,cur.source)<0)workouts.set(w.day,{...w,others:[...cur.others,cur.source]});else cur.others.push(w.source)}
 const workoutDays=[...workouts.keys()].sort();
 return {series,workouts,workoutRange:workoutDays.length?[workoutDays[0],workoutDays.at(-1)]:null,sources:[...seen].sort(),skipped,timeZone:zone};
}

// Statistics. Each comparison is a Welch t-test (unequal variances, two-sided) plus Hedges' g, the standardized mean
// difference with a small-sample correction. Rule, kept deliberately simple and conservative:
//   clear    = p < 0.05 and |g| >= 0.5 (a medium effect that is unlikely to be chance)
//   possible = p < 0.10 and |g| >= 0.4 (an early hint worth watching)
// and in both cases the groups differ by at least 3% of the comparison mean, so a statistically tidy but trivial gap
// is not shown. Anything else is reported in basis.checked as "no clear difference". Days are treated as independent,
// which wearable data only approximates; that is one more reason the copy talks about patterns, never causes.
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const variance=(a,m)=>a.length>1?a.reduce((s,v)=>s+(v-m)**2,0)/(a.length-1):0;
function lnGamma(z){const c=[0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];if(z<.5)return Math.log(Math.PI/Math.sin(Math.PI*z))-lnGamma(1-z);z-=1;let x=c[0];for(let i=1;i<9;i++)x+=c[i]/(z+i);const t=z+7.5;return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(x)}
// Continued fraction for the regularized incomplete beta function (Lentz's method, as in Numerical Recipes).
function betaFraction(x,a,b){const tiny=1e-300;let c=1,d=1-(a+b)*x/(a+1);if(Math.abs(d)<tiny)d=tiny;d=1/d;let h=d;
 for(let m=1;m<=300;m++){const m2=2*m;let aa=m*(b-m)*x/((a-1+m2)*(a+m2));d=1+aa*d;if(Math.abs(d)<tiny)d=tiny;c=1+aa/c;if(Math.abs(c)<tiny)c=tiny;d=1/d;h*=d*c;
  aa=-(a+m)*(a+b+m)*x/((a+m2)*(a+1+m2));d=1+aa*d;if(Math.abs(d)<tiny)d=tiny;c=1+aa/c;if(Math.abs(c)<tiny)c=tiny;d=1/d;const del=d*c;h*=del;if(Math.abs(del-1)<3e-14)break}
 return h}
function incompleteBeta(x,a,b){if(x<=0)return 0;if(x>=1)return 1;const front=Math.exp(lnGamma(a+b)-lnGamma(a)-lnGamma(b)+a*Math.log(x)+b*Math.log(1-x));return x<(a+1)/(a+b+2)?front*betaFraction(x,a,b)/a:1-front*betaFraction(1-x,b,a)/b}
export const tTestP=(t,df)=>Number.isFinite(t)?incompleteBeta(df/(df+t*t),df/2,.5):0;
export function compareGroups(a,b){
 const na=a.length,nb=b.length,ma=mean(a),mb=mean(b),va=variance(a,ma),vb=variance(b,mb),se2=va/na+vb/nb;
 const t=se2>0?(ma-mb)/Math.sqrt(se2):ma===mb?0:Math.sign(ma-mb)*Infinity,df=se2>0?se2**2/((va/na)**2/(na-1)+(vb/nb)**2/(nb-1)):na+nb-2;
 const sp=Math.sqrt(((na-1)*va+(nb-1)*vb)/(na+nb-2)),d=sp>0?(ma-mb)/sp:ma===mb?0:Math.sign(ma-mb)*10,g=Math.max(-10,Math.min(10,d*(1-3/(4*(na+nb)-9))));
 return {meanA:ma,meanB:mb,p:tTestP(t,df),g};
}
export function strengthOf({p,g,differencePct}){if(Math.abs(differencePct)<3)return null;if(p<.05&&Math.abs(g)>=.5)return 'clear';if(p<.1&&Math.abs(g)>=.4)return 'possible';return null}

// Copy helpers. Values are shown the way the app formats them; % measures differ in points, others in percent.
const LABEL={recovery:'recovery',hrv:'HRV',hrv_sdnn:'HRV (SDNN)',resting_hr:'resting heart rate',strain:'strain',active_energy:'active energy',energy_burned:'calories burned',steps:'steps'};
const round=(v,d=0)=>Math.round(v*10**d)/10**d;
export function formatMeasure(kind,v){if(v==null||!Number.isFinite(v))return '—';if(kind==='recovery')return round(v)+'%';if(kind==='hrv'||kind==='hrv_sdnn')return round(v)+' ms';if(kind==='resting_hr')return round(v)+' bpm';if(kind==='sleep')return round(v,1).toFixed(1)+' h';if(kind==='strain')return round(v,1).toFixed(1);if(kind==='steps')return round(v).toLocaleString('en-US')+' steps';if(kind==='active_energy'||kind==='energy_burned')return round(v).toLocaleString('en-US')+' kcal';return String(round(v,1))}
const diffPhrase=(kind,difference,pct)=>(kind==='recovery'?`${round(Math.abs(difference))} points`:`${round(Math.abs(pct))}%`)+(difference<0?' lower':' higher');
const CAVEAT={clear:'A consistent pattern in your own data. It shows what tends to happen together, not that one causes the other.',possible:'An early hint, not yet consistent. More days will show whether it holds. It shows what tends to happen together, not that one causes the other.'};
const cleanText=(s,max)=>String(s??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);

const NEXT_DAY_OUTCOMES=['recovery','hrv','hrv_sdnn','resting_hr'];
// Builds the two groups for one outcome. `exposure(day)` returns 'A', 'B' or null for each candidate day; the outcome is
// read `offset` days later. Also notes which source was used on days where two sources recorded the same measure.
function groupsFor(days,exposure,series,outcome,offset,exposureKind){
 const out=series.get(outcome),expo=exposureKind?series.get(exposureKind):null,a=[],b=[],used=new Set(),chosen=new Map();let conflicts=0;
 if(!out)return {a,b,used,conflicts,chosen};
 for(const day of days){const group=exposure(day);if(!group)continue;const o=out.get(addDays(day,offset));if(!o)continue;(group==='A'?a:b).push(o.value);used.add(sourceFamily(o.source));if(o.others.length){conflicts++;chosen.set(o.source,(chosen.get(o.source)||0)+1)}const e=expo?.get(day);if(e){used.add(sourceFamily(e.source));if(e.others.length){conflicts++;chosen.set(e.source,(chosen.get(e.source)||0)+1)}}}
 return {a,b,used,conflicts,chosen};
}
// Outcomes are tried in a fixed order and the first with enough days is used, so we never pick whichever looks strongest.
function analyse({id,title,days,exposure,series,outcomes,offset,exposureKind,labels,sentence,workouts}){
 let best=null;
 for(const outcome of outcomes){
  const g=groupsFor(days,exposure,series,outcome,offset,exposureKind);if(workouts)for(const day of days){const w=workouts.get(day);if(w&&exposure(day)&&series.get(outcome)?.has(addDays(day,offset))){g.used.add(sourceFamily(w.source));if(w.others.length){g.conflicts++;g.chosen.set(w.source,(g.chosen.get(w.source)||0)+1)}}}
  if(g.a.length>=MIN_PER_GROUP&&g.b.length>=MIN_PER_GROUP)return {ok:true,result:build(outcome,g)};
  if(!best||Math.min(g.a.length,g.b.length)>Math.min(best.a.length,best.b.length))best={outcome,a:g.a,b:g.b};
 }
 return {ok:false,have:best?{metric:best.outcome,groupA:best.a.length,groupB:best.b.length}:{groupA:0,groupB:0}};
 function build(metric,g){
  const s=compareGroups(g.a,g.b),difference=s.meanA-s.meanB,differencePct=s.meanB?difference/Math.abs(s.meanB)*100:0,strength=strengthOf({p:s.p,g:s.g,differencePct});
  const label=LABEL[metric],groupA={label:labels[0],mean:round(s.meanA,metric==='recovery'||metric==='resting_hr'?1:2),n:g.a.length},groupB={label:labels[1],mean:round(s.meanB,metric==='recovery'||metric==='resting_hr'?1:2),n:g.b.length};
  const item={id,title:title(label),finding:sentence({label,a:formatMeasure(metric,s.meanA),diff:diffPhrase(metric,difference,differencePct),nA:g.a.length,nB:g.b.length}),metric,groupA,groupB,difference:round(difference,2),differencePct:round(differencePct,1),strength,pValue:round(s.p,4),effectSize:round(s.g,2),sources:[...g.used].sort()};
  if(g.conflicts){const [source]=[...g.chosen].sort((x,y)=>y[1]-x[1]||compareSources(x[0],y[0]))[0];item.sourceNote=`On ${g.conflicts} day${g.conflicts===1?'':'s'} two sources recorded the same measure; Xeyo used ${source}, the first connected source in its order (${SOURCE_ORDER.join(', ')}).`}
  if(strength)item.caveat=CAVEAT[strength];
  return item;
 }
}
const span=(first,last)=>{const out=[];for(let d=first;d<=last;d=addDays(d,1))out.push(d);return out};

/** computeCorrelations({readings, behaviors, timeZone, now}) → {items, missing, basis}. */
export function computeCorrelations({readings=[],behaviors=[],timeZone='UTC',now=Date.now(),days:windowDays=365}={}){
 const data=dailyData(readings,{timeZone,now,days:windowDays}),{series,workouts}=data,items=[],missing=[],checked=[];
 const allDays=new Set();for(const byDay of series.values())for(const d of byDay.keys())allDays.add(d);const sorted=[...allDays].sort();
 const consider=(r,meta)=>{if(r.ok){if(r.result.strength)items.push(r.result);else checked.push({id:r.result.id,title:r.result.title,metric:r.result.metric,groupA:r.result.groupA,groupB:r.result.groupB,result:'no clear difference'})}else missing.push({...meta,have:r.have})};

 // (a) Late workouts and next-morning HRV, over the days the member was tracking workouts at all.
 if(data.workoutRange){
  const days=span(data.workoutRange[0],data.workoutRange[1]);
  consider(analyse({id:'late_workouts',days,exposure:d=>workouts.get(d)?.late?'A':'B',series,outcomes:['hrv','hrv_sdnn'],offset:1,workouts,labels:['Workout starting at 7 pm or later','Earlier or no workout'],
   title:l=>`Late workouts and next-morning ${l}`,sentence:x=>`After workouts that start at 7 pm or later, your next-morning ${x.label} averages ${x.a}, ${x.diff} than after earlier or no workouts (n=${x.nA} vs ${x.nB}).`}),
   {id:'late_workouts',title:'Late workouts and next-morning HRV',needs:`At least ${MIN_PER_GROUP} evenings with a workout starting at 7 pm or later and ${MIN_PER_GROUP} other evenings, each followed by a morning HRV reading.`});
 }else missing.push({id:'late_workouts',title:'Late workouts and next-morning HRV',needs:'Workouts with start times (from WHOOP, Garmin or an import) and HRV the next morning. Xeyo has no workouts yet.',have:{groupA:0,groupB:0}});

 // (b) Short nights. A night is filed on the day it ends, so the morning after it is the same day.
 const sleep=series.get('sleep');
 consider(analyse({id:'short_sleep',days:sleep?[...sleep.keys()].sort():[],exposure:d=>{const v=sleep.get(d)?.value;return v==null?null:v<SHORT_SLEEP_HOURS?'A':'B'},series,outcomes:NEXT_DAY_OUTCOMES,offset:0,exposureKind:'sleep',labels:['Nights under 6 h','Nights of 6 h or more'],
  title:l=>`Short nights and next-morning ${l}`,sentence:x=>`After nights under 6 h of sleep, your ${x.label} the next morning averages ${x.a}, ${x.diff} than after nights of 6 h or more (n=${x.nA} vs ${x.nB}).`}),
  {id:'short_sleep',title:'Short nights and next-morning recovery',needs:`At least ${MIN_PER_GROUP} nights under 6 h and ${MIN_PER_GROUP} nights of 6 h or more, each with recovery, HRV or resting heart rate the next morning.`});

 // (c) High-load days (the member's own top third) and the next day. The first load measure with enough days is used.
 let loadDone=false,loadHave={groupA:0,groupB:0};
 for(const load of ['strain','active_energy','energy_burned','steps']){
  const byDay=series.get(load);if(!byDay||byDay.size<MIN_PER_GROUP*3)continue;
  const usable=[...byDay.keys()].filter(d=>NEXT_DAY_OUTCOMES.some(o=>series.get(o)?.has(addDays(d,1)))).sort(),values=usable.map(d=>byDay.get(d).value).sort((x,y)=>x-y);if(values.length<MIN_PER_GROUP*3)continue;
  const cut=values[Math.floor(values.length*2/3)],shown=formatMeasure(load,cut);
  const r=analyse({id:'high_load',days:usable,exposure:d=>byDay.get(d).value>=cut?'A':'B',series,outcomes:NEXT_DAY_OUTCOMES,offset:1,exposureKind:load,labels:[`${LABEL[load][0].toUpperCase()+LABEL[load].slice(1)} ${shown} or more (your top third)`,'Lighter days'],
   title:l=>`High-${load==='strain'?'strain':'activity'} days and next-day ${l}`,sentence:x=>`The day after your top-third ${LABEL[load]} days (${shown} or more), your ${x.label} averages ${x.a}, ${x.diff} than after lighter days (n=${x.nA} vs ${x.nB}).`});
  if(r.ok){r.result.threshold={kind:load,value:round(cut,1)};consider(r);loadDone=true;break}loadHave=r.have;
 }
 if(!loadDone)missing.push({id:'high_load',title:'High-strain days and next-day recovery',needs:`At least ${MIN_PER_GROUP*3} days with strain, active energy, calories burned or steps, each followed by recovery, HRV or resting heart rate the next day (so the top third holds ${MIN_PER_GROUP}).`,have:loadHave});

 // (d) WHOOP journal answers. `day` is the day the behaviour was logged for; its effect shows the following morning.
 const questions=new Map();
 for(const b of behaviors||[]){if(typeof b?.answered_yes!=='boolean'||!/^\d{4}-\d{2}-\d{2}$/.test(b.day||''))continue;const question=cleanText(b.question,120);if(!question)continue;const key=question.toLowerCase(),q=questions.get(key)||{question,answers:new Map()};q.answers.set(b.day,(q.answers.get(b.day)||false)||b.answered_yes);questions.set(key,q)}
 const ranked=[...questions.values()].sort((x,y)=>y.answers.size-x.answers.size||(x.question<y.question?-1:1)).slice(0,12);let bestBehaviour=null;
 for(const q of ranked){
  const r=analyse({id:'behavior:'+q.question.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60),days:[...q.answers.keys()].sort(),exposure:d=>q.answers.get(d)?'A':'B',series,outcomes:NEXT_DAY_OUTCOMES,offset:1,labels:[`Answered yes to “${q.question}”`,'Answered no'],
   title:l=>`“${q.question}” and next-day ${l}`,sentence:x=>`The day after you answered yes to “${q.question}”, your ${x.label} averages ${x.a}, ${x.diff} than after days you answered no (n=${x.nA} vs ${x.nB}).`});
  if(r.ok){r.result.behavior=q.question;consider(r)}else if(!bestBehaviour||Math.min(r.have.groupA,r.have.groupB)>Math.min(bestBehaviour.have.groupA,bestBehaviour.have.groupB))bestBehaviour={question:q.question,have:r.have};
 }
 if(!ranked.length)missing.push({id:'behaviors',title:'Journal habits and next-day recovery',needs:'WHOOP journal answers (import your WHOOP data export) to compare habits such as alcohol with your next-day recovery or HRV.',have:{groupA:0,groupB:0}});
 else if(![...items,...checked].some(i=>i.id.startsWith('behavior:'))&&bestBehaviour)missing.push({id:'behaviors',title:'Journal habits and next-day recovery',needs:`At least ${MIN_PER_GROUP} yes and ${MIN_PER_GROUP} no answers to one WHOOP journal question, each followed by recovery, HRV or resting heart rate the next morning. Closest so far: “${bestBehaviour.question}”.`,have:bestBehaviour.have});

 items.sort((x,y)=>(x.strength==='clear'?0:1)-(y.strength==='clear'?0:1)||Math.abs(y.effectSize)-Math.abs(x.effectSize)||(x.id<y.id?-1:1));
 const measures={};for(const [kind,byDay] of series)measures[kind]=byDay.size;
 return {items:items.slice(0,8),missing,basis:{days:sorted.length,firstDay:sorted[0]||null,lastDay:sorted.at(-1)||null,windowDays,timeZone:data.timeZone,sources:data.sources,measures,workoutDays:workouts.size,behaviorQuestions:questions.size,
  minimumPerGroup:MIN_PER_GROUP,lateWorkoutHour:LATE_HOUR,shortSleepHours:SHORT_SLEEP_HOURS,sourceOrder:SOURCE_ORDER,excludedReadings:data.skipped,checked,
  method:'Welch t-test and Hedges’ g on daily values. Clear: p < 0.05 and |g| ≥ 0.5. Possible: p < 0.10 and |g| ≥ 0.4. Both need a difference of at least 3%.',
  note:'These are patterns in your own data. They show what tends to happen together, not what causes what, and they are not medical advice.'}};
}
