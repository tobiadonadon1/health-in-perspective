import test from 'node:test';import assert from 'node:assert/strict';
import {staleDays,compareLatest,metricInsights,insightText,apportion,sleepGoalSummary,weeklyComparison} from '../src/insights.js';
import {demoReadings,DEMO_SOURCE} from '../src/demo.js';
import {validationText} from '../src/form-errors.js';
import {journalPreview,moodPatterns} from '../src/journal.js';
import {metrics} from '../src/metrics.js';
const DAY=86400000,now=Date.parse('2026-10-26T12:00:00Z');
const series=(kind,values,unit='ms')=>values.map((value,i)=>({kind,value,unit,source:'WHOOP',observed_at:new Date(now-i*DAY).toISOString()}));
test('old readings are stale after three days; unusual means outside the person\'s own range',()=>{
 assert.equal(staleDays({observed_at:new Date(now-2*DAY).toISOString()},now),0);
 assert.equal(staleDays({observed_at:new Date(now-67*DAY).toISOString()},now),67);
 const awake=series('sleep_awake',[99,...Array.from({length:20},(_,i)=>42+(i%5)-2)],'min');
 const c=compareLatest(awake,awake[0],{now});assert.ok(c.unusual);assert.ok(c.pct>100);
 const calm=series('sleep_awake',[44,...Array.from({length:20},(_,i)=>42+(i%5)-2)],'min');assert.equal(compareLatest(calm,calm[0],{now}).unusual,false);
});
test('insights skip stale and thin signals and lead with unusual changes',()=>{
 const rows=[...series('hrv',[50,...Array(15).fill(60).map((v,i)=>v+(i%3))]),...series('resting_hr',[66,...Array(15).fill(60).map((v,i)=>v+(i%2))],'bpm'),...series('spo2',[90,97,97],'%')];
 rows.push({kind:'recovery',value:10,unit:'%',source:'WHOOP',observed_at:new Date(now-40*DAY).toISOString()});
 const list=metricInsights(rows.sort((a,b)=>b.observed_at.localeCompare(a.observed_at)),metrics,{now});
 assert.deepEqual(list.map(i=>i.kind).sort(),['hrv','resting_hr']);assert.ok(list.every(i=>i.unusual));
 assert.match(insightText(list.find(i=>i.kind==='hrv')),/^HRV is 1\d(\.\d)?% below your 30-day average$/);
});
test('sleep stages are rounded to add up to the hours shown',()=>{
 const parts=apportion([1.46,2.04,4.84],8.3);assert.equal(Math.round(parts.reduce((s,n)=>s+n,0)*10)/10,8.3);
 assert.deepEqual(apportion([1,2],9),[1,2],'parts far from the total are not bent to it');
});
test('sleep debt adds shortfalls only and weekly comparison needs two weeks',()=>{
 const nights=series('sleep',[6,9,7,8,6.5,8,8,8,8,8,8,8,8,8],'hours');
 const s=sleepGoalSummary(nights,8,{now});assert.equal(s.debt,2+1+1.5);assert.equal(s.met,11);
 const week=weeklyComparison(nights,metrics,{now});assert.equal(week.length,1);assert.equal(week[0].kind,'sleep');
 assert.equal(weeklyComparison(series('hrv',[60,61]),metrics,{now}).length,0);
});
test('sample data is labelled, covers the core signals and keeps stages within the night',()=>{
 const rows=demoReadings(now);assert.ok(rows.every(r=>r.source===DEMO_SOURCE));
 for(const kind of ['resting_hr','hrv','spo2','sleep','recovery','respiratory_rate'])assert.ok(rows.some(r=>r.kind===kind),kind);
 const day=rows.filter(r=>r.observed_at===rows.find(x=>x.kind==='sleep').observed_at),get=k=>day.find(r=>r.kind===k).value;
 assert.ok(Math.abs(get('sleep_deep')+get('sleep_rem')+get('sleep_light')-get('sleep'))<.02);
});
test('form errors speak the app\'s language for each constraint',()=>{
 const field=(type,validity,extra={})=>({type,tagName:'INPUT',validity:{valueMissing:false,typeMismatch:false,badInput:false,tooShort:false,tooLong:false,rangeUnderflow:false,rangeOverflow:false,stepMismatch:false,patternMismatch:false,...validity},...extra});
 assert.equal(validationText(field('text',{valueMissing:true})),'This field is required.');
 assert.match(validationText(field('email',{typeMismatch:true})),/valid email/);
 assert.equal(validationText(field('password',{tooShort:true},{minLength:12})),'Use at least 12 characters.');
 assert.equal(validationText(field('number',{rangeUnderflow:true},{min:'18'})),'Enter 18 or more.');
 assert.equal(validationText(field('date',{rangeOverflow:true})),'Choose today or an earlier date.');
});
test('journal previews drop markup and mood patterns line up with same-day readings',()=>{
 assert.equal(journalPreview('Felt <b>great</b> after a <i>walk</i>'),'Felt great after a walk');
 assert.ok(journalPreview('x'.repeat(300)).length<=140);
 const readings=[{kind:'recovery',value:80,observed_at:'2026-10-20T07:00:00Z'},{kind:'recovery',value:40,observed_at:'2026-10-21T07:00:00Z'},{kind:'sleep',value:8,observed_at:'2026-10-20T07:00:00Z'}];
 const p=moodPatterns([{mood:'great',logged_on:'2026-10-20'},{mood:'low',logged_on:'2026-10-21'},{mood:'low',logged_on:'2026-10-22'}],readings);
 assert.deepEqual(p.map(x=>[x.id,x.count,x.recovery,x.sleep]),[['great',1,80,8],['low',2,40,null]]);
});
test('CSV export quotes, flattens objects and neutralises spreadsheet formulas',async()=>{const {toCSV}=await import('../src/export-csv.js');
 const csv=toCSV([{name:'Toast, butter',note:'=HYPERLINK("x")',meta:{a:1}},{name:'Tea',extra:'-2'}]).split('\r\n');
 assert.equal(csv[0],'name,note,meta,extra');assert.equal(csv[1],'"Toast, butter","\'=HYPERLINK(""x"")","{""a"":1}",');assert.equal(csv[2],"Tea,,,'-2");});
