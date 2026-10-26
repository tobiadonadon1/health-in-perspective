// Pure helpers behind Home insights, stale and unusual readings, sleep goals and the weekly summary.
// Comparisons are with the person's own recent data and describe a difference; they never judge it.
const DAY=86400000;

// Wearable signals are daily; an older latest reading is shown as "last recorded", not as today's value.
export const STALE_AFTER_DAYS=3;
export function staleDays(reading,now=Date.now()){if(!reading)return 0;const age=Math.floor((now-Date.parse(reading.observed_at))/DAY);return age>STALE_AFTER_DAYS?age:0}

// One mean per UTC day within the window, oldest first.
export function dailyMeans(rows,{days=30,now=Date.now()}={}){
 const byDay=new Map();
 for(const r of rows){const time=Date.parse(r.observed_at),value=Number(r.value);if(r.value==null||!Number.isFinite(value)||!Number.isFinite(time)||time>now||time<now-days*DAY)continue;const key=new Date(time).toISOString().slice(0,10);const list=byDay.get(key)||[];list.push(value);byDay.set(key,list)}
 return [...byDay.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([day,list])=>({day,value:list.reduce((s,n)=>s+n,0)/list.length}));
}

// How the latest reading compares with the person's other days in the last 30.
// "unusual" means outside about two standard deviations of their own daily values (with at least 7 other days).
export function compareLatest(rows,latest,{now=Date.now()}={}){
 if(!latest)return null;const value=Number(latest.value);if(!Number.isFinite(value))return null;
 const latestDay=new Date(Date.parse(latest.observed_at)).toISOString().slice(0,10);
 const others=dailyMeans(rows,{now}).filter(d=>d.day!==latestDay).map(d=>d.value);if(others.length<3)return null;
 const mean=others.reduce((s,n)=>s+n,0)/others.length,sd=Math.sqrt(others.reduce((s,n)=>s+(n-mean)**2,0)/others.length);
 const pct=mean?(value-mean)/Math.abs(mean)*100:0,z=sd>0?(value-mean)/sd:0;
 return {value,mean,sd,pct,z,days:others.length,unusual:others.length>=7&&Math.abs(z)>=2};
}

// Up to `limit` notable changes across fresh signals, most unusual first.
export function metricInsights(readings,metrics,{now=Date.now(),limit=3,kinds}={}){
 const out=[];
 for(const m of metrics){
  if(m.group==='body'||(kinds&&!kinds.includes(m.kind)))continue;
  const latest=readings.find(r=>r.kind===m.kind);if(!latest||staleDays(latest,now))continue;
  const rows=readings.filter(r=>r.kind===m.kind&&r.source===latest.source&&r.unit===latest.unit);
  const c=compareLatest(rows,latest,{now});if(!c||c.days<7)continue;
  if(Math.abs(c.pct)<5&&!c.unusual)continue;
  out.push({kind:m.kind,name:m.name,pct:c.pct,z:c.z,unusual:c.unusual,direction:c.pct>0?'up':'down'});
 }
 return out.sort((a,b)=>Number(b.unusual)-Number(a.unusual)||Math.abs(b.z)-Math.abs(a.z)).slice(0,limit);
}
export function insightText(i){const size=Math.abs(i.pct)<10?Math.abs(i.pct).toFixed(1).replace(/\.0$/,''):Math.round(Math.abs(i.pct));return `${i.name} ${/s$/.test(i.name)?'are':'is'} ${size}% ${i.direction==='up'?'above':'below'} your 30-day average`}

// Rounds parts to `decimals` so the displayed parts add up exactly to the displayed total (largest remainder).
// Parts are only rescaled when they already agree with the total to within `tolerance`.
export function apportion(values,total,{decimals=1,tolerance=.25}={}){
 const sum=values.reduce((s,n)=>s+n,0);if(!sum)return values.map(()=>0);
 const unit=10**decimals,target=Math.round((Math.abs(sum-total)<=tolerance?total:sum)*unit);
 const scaled=values.map(v=>v/sum*target),floors=scaled.map(Math.floor);let left=target-floors.reduce((s,n)=>s+n,0);
 const order=scaled.map((v,i)=>[v-Math.floor(v),i]).sort((a,b)=>b[0]-a[0]);
 for(const [,i] of order){if(left<=0)break;floors[i]++;left--}
 return floors.map(n=>n/unit);
}

// Nights in the last `nights` days against a goal; debt counts only shortfalls.
export function sleepGoalSummary(rows,goal,{nights=14,now=Date.now()}={}){
 const days=dailyMeans(rows,{days:nights,now});
 const debt=days.slice(-7).reduce((s,d)=>s+Math.max(0,goal-d.value),0);
 return {days,met:days.filter(d=>d.value>=goal).length,debt,average:days.length?days.reduce((s,d)=>s+d.value,0)/days.length:null};
}

// Last 7 days against the 7 before, per signal with data in both weeks.
export function weeklyComparison(readings,metrics,{now=Date.now()}={}){
 const out=[];
 for(const m of metrics){
  const rows=readings.filter(r=>r.kind===m.kind);if(!rows.length)continue;const source=rows[0].source,unit=rows[0].unit,own=rows.filter(r=>r.source===source&&r.unit===unit);
  const week=dailyMeans(own,{days:7,now}),prior=dailyMeans(own,{days:7,now:now-7*DAY});if(!week.length||!prior.length)continue;
  const avg=list=>list.reduce((s,d)=>s+d.value,0)/list.length,a=avg(week),b=avg(prior);
  out.push({kind:m.kind,name:m.name,unit:m.unit,week:a,prior:b,days:week.length,pct:b?(a-b)/Math.abs(b)*100:0});
 }
 return out;
}
