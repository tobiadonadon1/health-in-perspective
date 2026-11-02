import test from 'node:test';import assert from 'node:assert/strict';
import {todayBrief} from '../src/insights.js';
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
