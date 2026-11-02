// Pure helpers behind Home insights, stale and unusual readings, sleep goals and the weekly summary.
// Comparisons are with the person's own recent data and describe a difference; they never judge it.
const DAY=86400000;
// The person's calendar day for a time, so a reading lands on the day they lived it.
const localKey=time=>{const d=new Date(time);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};

// Wearable signals are daily; an older latest reading is shown as "last recorded", not as today's value.
export const STALE_AFTER_DAYS=3;
export function staleDays(reading,now=Date.now()){if(!reading)return 0;const age=Math.floor((now-Date.parse(reading.observed_at))/DAY);return age>STALE_AFTER_DAYS?age:0}

// One mean per local day within the window, oldest first.
export function dailyMeans(rows,{days=30,now=Date.now()}={}){
 const byDay=new Map();
 for(const r of rows){const time=Date.parse(r.observed_at),value=Number(r.value);if(r.value==null||!Number.isFinite(value)||!Number.isFinite(time)||time>now||time<now-days*DAY)continue;const key=localKey(time);const list=byDay.get(key)||[];list.push(value);byDay.set(key,list)}
 return [...byDay.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([day,list])=>({day,value:list.reduce((s,n)=>s+n,0)/list.length}));
}

// How the latest reading compares with the person's other days in the last 30.
// "unusual" means outside about two standard deviations of their own daily values (with at least 7 other days).
export function compareLatest(rows,latest,{now=Date.now()}={}){
 if(!latest)return null;const value=Number(latest.value);if(!Number.isFinite(value))return null;
 const latestDay=localKey(Date.parse(latest.observed_at));
 const others=dailyMeans(rows,{now}).filter(d=>d.day!==latestDay).map(d=>d.value);if(others.length<3)return null;
 const mean=others.reduce((s,n)=>s+n,0)/others.length,sd=Math.sqrt(others.reduce((s,n)=>s+(n-mean)**2,0)/others.length);
 const pct=mean?(value-mean)/Math.abs(mean)*100:0,z=sd>0?(value-mean)/sd:0;
 return {value,mean,sd,pct,z,days:others.length,unusual:others.length>=7&&Math.abs(z)>=2};
}


// The morning read on Home: how ready the body looks today, tonight's sleep need, and the changes worth a look.
// Readiness uses the wearable's own recovery score when there is one today (WHOOP's bands: 67+ high, 34-66 moderate,
// under 34 low); otherwise HRV against resting heart rate, each compared with the person's own last 30 days.
// It is guidance for the day, not a diagnosis, and it never claims more than the readings say.
const readinessCopy={
 high:['Ready to push','Your body has recovered well. A good day for a harder session.'],
 moderate:['Steady day','Train at a moderate effort and notice how you feel as the day goes on.'],
 low:['Go easier today','Favour light movement, water and an earlier night. Recovery is the work today.']
};
const freshToday=(r,now)=>r&&!staleDays(r,now)&&now-Date.parse(r.observed_at)<36*3600000;
export function todayBrief(readings,metrics,{now=Date.now(),delta,limit=2}={}){
 const latest=kind=>readings.find(r=>r.kind===kind),own=r=>readings.filter(x=>x.kind===r.kind&&x.source===r.source&&x.unit===r.unit);
 let readiness=null;const recovery=latest('recovery');
 if(freshToday(recovery,now)){const v=Number(recovery.value),level=v>=67?'high':v>=34?'moderate':'low';readiness={level,basis:`Recovery ${Math.round(v)}%`,kind:'recovery'}}
 else{const hrv=latest('hrv'),rhr=latest('resting_hr'),ch=freshToday(hrv,now)&&compareLatest(own(hrv),hrv,{now}),cr=freshToday(rhr,now)&&compareLatest(own(rhr),rhr,{now});
  if(ch&&cr&&ch.days>=7&&cr.days>=7){const score=ch.z-cr.z,level=score>.75?'high':score<-.75?'low':'moderate';readiness={level,basis:'HRV and resting heart rate against your usual',kind:'hrv'}}}
 if(readiness){const [headline,advice]=readinessCopy[readiness.level];Object.assign(readiness,{headline,advice})}
 const need=latest('sleep_needed'),sleep=freshToday(need,now)&&Number(need.value)>0?{hours:Math.round(Number(need.value)*10)/10,text:`Aim for ${Math.round(Number(need.value)*10)/10} h of sleep tonight`}:null;
 const changes=[];
 for(const m of metrics){
  if(m.group==='body'||m.kind===readiness?.kind)continue;
  const r=latest(m.kind);if(!r||staleDays(r,now))continue;
  const c=compareLatest(own(r),r,{now});if(!c||c.days<7)continue;
  const d=delta?delta(r.value,c.mean,r.unit):null;if(d?.direction==='flat')continue;
  if(!d&&Math.abs(c.pct)<5&&!c.unusual)continue;if(d&&!c.unusual&&Math.abs(c.z)<1)continue;
  changes.push({kind:m.kind,name:m.name,z:c.z,unusual:c.unusual,direction:c.pct>0?'up':'down',text:`${m.name} ${d?d.title:`${Math.round(Math.abs(c.pct))}% ${c.pct>0?'above':'below'} your 30-day average`}`});
 }
 changes.sort((a,b)=>Number(b.unusual)-Number(a.unusual)||Math.abs(b.z)-Math.abs(a.z));
 return {readiness,sleep,changes:changes.slice(0,limit)};
}

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
 // Nights are compared as shown, to a tenth of an hour, so a night displayed as 8.0 h meets an 8 h goal.
 const shown=v=>Math.round(v*10)/10;
 return {days,met:days.filter(d=>shown(d.value)>=goal).length,debt,average:days.length?days.reduce((s,d)=>s+d.value,0)/days.length:null};
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
