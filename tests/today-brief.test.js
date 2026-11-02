import test from 'node:test';import assert from 'node:assert/strict';
import {todayBrief,moodMatch} from '../src/insights.js';
import {metrics} from '../src/metrics.js';
import {metricDelta} from '../src/metric-style.js';
const DAY=86400000,now=Date.parse('2026-11-02T15:00:00Z');
const series=(kind,unit,values)=>values.map((value,i)=>({kind,unit,value,source:'WHOOP',observed_at:new Date(now-(values.length-1-i)*DAY-3600000).toISOString()})).reverse();
const sorted=rows=>rows.sort((a,b)=>b.observed_at.localeCompare(a.observed_at));
test('readiness follows the wearable recovery bands and names its basis',()=>{
 for(const [value,level] of [[80,'high'],[50,'moderate'],[20,'low']]){
  const b=todayBrief(sorted(series('recovery','%',[60,62,58,61,59,63,60,value])),metrics,{now,delta:metricDelta});
  assert.equal(b.readiness.level,level);assert.equal(b.readiness.basis,`Recovery ${value}%`);assert.ok(b.readiness.headline&&b.readiness.advice);
 }
});
test('without recovery, readiness compares HRV with resting heart rate against the person\'s own days',()=>{
 const hrv=series('hrv','ms',[60,62,58,61,59,63,60,61,59,62,40]),rhr=series('resting_hr','bpm',[55,56,54,55,56,54,55,56,55,54,66]);
 const b=todayBrief(sorted([...hrv,...rhr]),metrics,{now,delta:metricDelta});
 assert.equal(b.readiness.level,'low');assert.equal(b.readiness.kind,'hrv');
});
test('no fresh readings means no readiness, no sleep need and no changes',()=>{
 const old=series('recovery','%',[60,62,58]).map(r=>({...r,observed_at:new Date(Date.parse(r.observed_at)-20*DAY).toISOString()}));
 assert.deepEqual(todayBrief(sorted(old),metrics,{now,delta:metricDelta}),{readiness:null,sleep:null,changes:[]});
});
test('changes are worded in the signal\'s own unit and skip the readiness signal',()=>{
 const rows=sorted([...series('recovery','%',[70,72,71,69,70,73,72,70,71,40]),...series('spo2','%',[98,98,97,98,98,97,98,98,97,95]),...series('hrv','ms',[60,62,58,61,59,63,60,61,59,85])]);
 const b=todayBrief(rows,metrics,{now,delta:metricDelta});
 assert.ok(!b.changes.some(c=>c.kind==='recovery'));
 assert.ok(b.changes.some(c=>c.text==='Blood oxygen 2.7 points below your 30-day average'),JSON.stringify(b.changes));
 assert.ok(b.changes.some(c=>/^HRV \d+% above your 30-day average$/.test(c.text)));
});
test('tonight\'s sleep need comes from the wearable when it is current',()=>{
 const b=todayBrief(sorted(series('sleep_needed','hours',[8.4,8.6])),metrics,{now,delta:metricDelta});
 assert.equal(b.sleep.text,'Aim for 8.6 h of sleep tonight');
});
test('Apple Watch HRV (SDNN) gives a readiness read when there is no WHOOP recovery or HRV',()=>{
 const hrv=series('hrv_sdnn','ms',[48,50,47,49,51,48,50,49,47,50,30]),rhr=series('resting_hr','bpm',[58,57,58,59,57,58,57,58,59,58,68]);
 const b=todayBrief(sorted([...hrv,...rhr]),metrics,{now,delta:metricDelta});
 assert.equal(b.readiness.level,'low');assert.equal(b.readiness.kind,'hrv_sdnn');
});
const recovery=value=>sorted(series('recovery','%',[60,62,58,61,59,63,60,value]));
test('feeling wrecked overrides a good-looking recovery, and says why',()=>{
 const b=todayBrief(recovery(85),metrics,{now,delta:metricDelta,checkin:{mood:'rough'}});
 assert.equal(b.readiness.level,'low');assert.ok(b.readiness.overridden);assert.equal(b.readiness.felt,'rough');
 assert.match(b.readiness.advice,/Your numbers look ready, but you said you feel wrecked\. How you feel wins today/);
 assert.equal(b.readiness.basis,'You feel wrecked · Recovery 85%');
});
test('a low check-in lowers the read by one level; good moods never raise it',()=>{
 assert.equal(todayBrief(recovery(85),metrics,{now,delta:metricDelta,checkin:{mood:'low'}}).readiness.level,'moderate');
 assert.equal(todayBrief(recovery(50),metrics,{now,delta:metricDelta,checkin:{mood:'low'}}).readiness.level,'low');
 const great=todayBrief(recovery(20),metrics,{now,delta:metricDelta,checkin:{mood:'great'}}).readiness;
 assert.equal(great.level,'low');assert.ok(!great.overridden);
 const agree=todayBrief(recovery(20),metrics,{now,delta:metricDelta,checkin:{mood:'rough'}}).readiness;
 assert.equal(agree.level,'low');assert.ok(agree.agrees);assert.ok(!agree.overridden);
});
test('a rough check-in still gives advice when there is no wearable data',()=>{
 const b=todayBrief([],metrics,{now,delta:metricDelta,checkin:{mood:'rough'}});
 assert.equal(b.readiness.level,'low');assert.equal(b.readiness.kind,null);assert.equal(b.readiness.basis,'From your check-in');
});
test('moodMatch finds the signals that move with mood and counts disagreements',()=>{
 const moods=['great','good','okay','low','rough','good','great','low','okay','rough'];
 const day=i=>{const d=new Date(now-(i+1)*DAY);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
 const at=i=>{const d=new Date(now-(i+1)*DAY);d.setHours(8,0,0,0);return d.toISOString()};
 const score={great:5,good:4,okay:3,low:2,rough:1};
 const entries=moods.map((mood,i)=>({logged_on:day(i),mood}));
 const rows=[...moods.map((m,i)=>({kind:'hrv',unit:'ms',value:30+score[m]*8,source:'WHOOP',observed_at:at(i)})),
  ...moods.map((m,i)=>({kind:'sleep',unit:'hours',value:7+(i%2)*.4,source:'WHOOP',observed_at:at(i)})),
  ...moods.map((m,i)=>({kind:'recovery',unit:'%',value:i===4?88:50,source:'WHOOP',observed_at:at(i)}))];
 const m=moodMatch(entries,rows,metrics);
 assert.equal(m.signals[0].kind,'hrv');assert.equal(m.signals[0].strength,'closely');assert.equal(m.signals[0].n,10);
 assert.equal(m.signals.find(s=>s.kind==='sleep').strength,'barely');
 assert.equal(m.compared,10);assert.equal(m.mismatches,1,'rough on an 88% recovery day');
 assert.deepEqual(moodMatch(entries.slice(0,5),rows,metrics).signals,[],'needs 8 check-ins');
});
test('moodMatch says when a signal moves the opposite way to how you feel',()=>{
 const moods=['great','good','okay','low','rough','good','great','low','okay','rough'],score={great:5,good:4,okay:3,low:2,rough:1};
 const day=i=>{const d=new Date(now-(i+1)*DAY);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
 const at=i=>{const d=new Date(now-(i+1)*DAY);d.setHours(8,0,0,0);return d.toISOString()};
 const rows=[...moods.map((m,i)=>({kind:'recovery',unit:'%',value:100-score[m]*10,source:'WHOOP',observed_at:at(i)})),...moods.map((m,i)=>({kind:'resting_hr',unit:'bpm',value:70-score[m]*2,source:'WHOOP',observed_at:at(i)}))];
 const s=moodMatch(moods.map((mood,i)=>({logged_on:day(i),mood})),rows,metrics).signals;
 assert.equal(s.find(x=>x.kind==='recovery').aligned,false);assert.equal(s.find(x=>x.kind==='resting_hr').aligned,true);
});
