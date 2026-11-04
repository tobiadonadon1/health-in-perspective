import test from 'node:test';
import assert from 'node:assert/strict';
import {computeCorrelations,dailyData,compareGroups,tTestP,strengthOf,sourceRank,MIN_PER_GROUP} from '../supabase/functions/health-api/correlations.mjs';

// Synthetic, seeded data: every effect below is planted on purpose, so the expected answer is known.
const NOW=Date.parse('2027-02-01T12:00:00Z'),START='2026-11-02';
const day=i=>new Date(Date.parse(START+'T00:00:00Z')+i*86400000).toISOString().slice(0,10);
const at=(i,time)=>`${day(i)}T${time}:00Z`;
function rng(seed){return ()=>{seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}}
const r=(kind,value,unit,source,observed_at,external_id=kind+':'+source+':'+observed_at)=>({kind,value,unit,source,observed_at,external_id});

// 60 days of WHOOP: a workout every day, at 20:00 on every 4th day; HRV each morning, `effect` ms lower after late days.
function lateWorkoutData({effect=-10,lateEvery=4,lateTime='20:00',earlyTime='07:00',hrv=null,days=60,seed=1}={}){
 const rand=rng(seed),rows=[],late=i=>i%lateEvery===0;
 for(let i=0;i<days;i++){
  rows.push(r('workout',45,'min','WHOOP',at(i,late(i)?lateTime:earlyTime)));
  const value=hrv?hrv(i):60+(rand()*8-4)+(i>0&&late(i-1)?effect:0);rows.push(r('hrv',Math.round(value*10)/10,'ms','WHOOP',at(i,'07:30')));
 }
 return rows;
}

test('the statistics behind the strength rule are right', () => {
 assert.ok(Math.abs(tTestP(2.228,10)-.05)<.001);
 const s=compareGroups([1,2,3,4,5],[3,4,5,6,7]);assert.ok(Math.abs(s.p-.0805)<.001);assert.ok(s.g<-1);
 assert.equal(strengthOf({p:.01,g:.8,differencePct:10}),'clear');
 assert.equal(strengthOf({p:.08,g:.45,differencePct:10}),'possible');
 assert.equal(strengthOf({p:.3,g:.2,differencePct:10}),null);
 assert.equal(strengthOf({p:.001,g:2,differencePct:1}),null,'a trivial difference is never a finding');
 assert.ok(sourceRank('WHOOP')<sourceRank('WHOOP import · WHOOP')&&sourceRank('Garmin')<sourceRank('Fitbit')&&sourceRank('Apple Health import · Watch')<sourceRank('Manual entry'));
});

test('late workouts with a planted HRV drop are found, with numbers and n', () => {
 const out=computeCorrelations({readings:lateWorkoutData(),timeZone:'UTC',now:NOW});
 const item=out.items.find(i=>i.id==='late_workouts');assert.ok(item,'late workout insight');
 assert.equal(item.metric,'hrv');assert.equal(item.strength,'clear');
 assert.equal(item.groupA.n,15);assert.equal(item.groupB.n,44,'59 evenings with a next morning, 15 of them late');
 assert.ok(item.difference<-7&&item.difference>-13,String(item.difference));
 assert.match(item.finding,/^After workouts that start at 7 pm or later, your next-morning HRV averages \d+ ms, \d+% lower than after earlier or no workouts \(n=15 vs 44\)\.$/);
 assert.deepEqual(item.sources,['WHOOP']);assert.match(item.caveat,/not that one causes the other/);
 assert.equal(out.basis.minimumPerGroup,MIN_PER_GROUP);assert.equal(out.basis.timeZone,'UTC');assert.ok(out.basis.days>=60);
});

test('no effect means no finding: the comparison is listed as checked instead', () => {
 // HRV alternates ±3 ms by day; late days are spread so both groups average exactly 60 ms.
 const out=computeCorrelations({readings:lateWorkoutData({lateEvery:2,hrv:i=>60+(i%4<2?3:-3)}),now:NOW});
 assert.equal(out.items.find(i=>i.id==='late_workouts'),undefined);
 const checked=out.basis.checked.find(c=>c.id==='late_workouts');assert.ok(checked);assert.equal(checked.result,'no clear difference');
});

test('too few late evenings returns no items and says what would unlock the insight', () => {
 const rows=lateWorkoutData({lateEvery:1000}).concat([10,20,30].map(i=>r('workout',40,'min','WHOOP',at(i,'21:00'))));
 const out=computeCorrelations({readings:rows,now:NOW});
 assert.deepEqual(out.items,[]);
 const m=out.missing.find(x=>x.id==='late_workouts');assert.ok(m);assert.equal(m.have.groupA,4);assert.match(m.needs,/At least 5 evenings with a workout starting at 7 pm or later/);
});

test('no data at all: nothing invented, every insight explains its missing data', () => {
 const out=computeCorrelations({readings:[],behaviors:[],now:NOW});
 assert.deepEqual(out.items,[]);assert.deepEqual(out.missing.map(m=>m.id),['late_workouts','short_sleep','high_load','behaviors']);assert.equal(out.basis.days,0);
});

test('"late" uses the member’s time zone, and after-midnight starts count for the evening before', () => {
 // 18:30 UTC is 19:30 in Rome (UTC+1 in winter): late there, not in UTC.
 const rows=lateWorkoutData({lateTime:'18:30'});
 assert.equal(computeCorrelations({readings:rows,timeZone:'UTC',now:NOW}).items.find(i=>i.id==='late_workouts'),undefined);
 assert.equal(computeCorrelations({readings:rows,timeZone:'UTC',now:NOW}).missing.find(m=>m.id==='late_workouts').have.groupA,0);
 const rome=computeCorrelations({readings:rows,timeZone:'Europe/Rome',now:NOW}).items.find(i=>i.id==='late_workouts');assert.ok(rome);assert.equal(rome.groupA.n,15);
 // 04:30 UTC on Nov 11 is 23:30 on Nov 10 in New York: a late workout on the 10th. In UTC it is an early workout on the 11th.
 const ny=dailyData([r('workout',50,'min','Garmin','2026-11-11T04:30:00Z')],{timeZone:'America/New_York',now:NOW}).workouts;
 assert.equal(ny.get('2026-11-10').late,true);
 const utc=dailyData([r('workout',50,'min','Garmin','2026-11-11T04:30:00Z')],{timeZone:'UTC',now:NOW}).workouts;
 assert.equal(utc.get('2026-11-11').late,false);
 // 23:30 UTC is 00:30 in Rome on the next calendar day; it still belongs to the Rome evening it continued.
 const lateNight=dailyData([r('workout',50,'min','WHOOP','2026-11-10T23:30:00Z')],{timeZone:'Europe/Rome',now:NOW}).workouts;
 assert.equal(lateNight.get('2026-11-10').late,true);assert.equal(lateNight.has('2026-11-11'),false);
 // Date-stamped daily summaries (12:00 UTC) keep their calendar date even 13 hours east of UTC.
 assert.ok(dailyData([r('resting_hr',50,'bpm','Garmin','2026-11-10T12:00:00Z')],{timeZone:'Pacific/Auckland',now:NOW}).series.get('resting_hr').has('2026-11-10'));
 // An invalid zone falls back to UTC rather than failing.
 assert.equal(computeCorrelations({readings:rows,timeZone:'Not/AZone',now:NOW}).basis.timeZone,'UTC');
});

test('short nights fall back to resting heart rate when there is no recovery or HRV (Fitbit)', () => {
 const rand=rng(7),rows=[];
 for(let i=0;i<60;i++){const short=i%5===0;rows.push(r('sleep',short?5.2+rand()*.4:7.2+rand()*.8,'hours','Fitbit',at(i,'06:30')));rows.push(r('resting_hr',Math.round(55+rand()*3+(short?5:0)),'bpm','Fitbit',`${day(i)}T12:00:00Z`))}
 const item=computeCorrelations({readings:rows,now:NOW}).items.find(i=>i.id==='short_sleep');
 assert.ok(item);assert.equal(item.metric,'resting_hr');assert.equal(item.groupA.n,12);assert.equal(item.groupB.n,48);
 assert.match(item.finding,/^After nights under 6 h of sleep, your resting heart rate the next morning averages \d+ bpm, \d+% higher than after nights of 6 h or more \(n=12 vs 48\)\.$/);
 assert.deepEqual(item.sources,['Fitbit']);
});

test('HRV RMSSD and SDNN are never pooled, and readings in other units are skipped', () => {
 // Late on every 4th day. The morning after half the late days has only RMSSD, after the other half only SDNN: 4 + 4.
 const rows=[];
 for(let i=0;i<32;i++){
  rows.push(r('workout',45,'min','WHOOP',at(i,i%4===0?'20:00':'07:00')));
  const afterSdnnLate=(i-1)%8===4,afterLate=(i-1)%4===0;
  if(!afterSdnnLate)rows.push(r('hrv',afterLate?45:60+(i%3),'ms','WHOOP',at(i,'07:30')));
  if(afterSdnnLate||i%4===3)rows.push(r('hrv_sdnn',afterSdnnLate?30:45+(i%3),'ms','Apple Health import · Apple Watch',at(i,'20:00')));
 }
 rows.push(r('hrv',0.05,'s','Garmin',at(9,'07:00')));
 const out=computeCorrelations({readings:rows,now:NOW});
 assert.equal(out.items.find(i=>i.id==='late_workouts'),undefined,'pooling RMSSD with SDNN would have produced 8 late mornings');
 const m=out.missing.find(x=>x.id==='late_workouts');assert.equal(m.have.groupA,4);
 assert.equal(out.basis.excludedReadings,1);
 assert.equal(dailyData(rows,{now:NOW}).series.get('hrv').get(day(9)).source,'WHOOP','the reading in seconds never replaced a ms reading');
});

test('two sources on the same day: one deterministic source is used and named', () => {
 const whoop=lateWorkoutData(),garmin=whoop.filter(x=>x.kind==='hrv').map(x=>({...x,source:'Garmin',value:x.value+20,external_id:'g'+x.external_id}));
 const alone=computeCorrelations({readings:whoop,now:NOW}).items.find(i=>i.id==='late_workouts');
 const both=computeCorrelations({readings:[...garmin,...whoop],now:NOW}),item=both.items.find(i=>i.id==='late_workouts');
 assert.deepEqual([item.groupA,item.groupB],[alone.groupA,alone.groupB],'Garmin’s offset values never leaked into the means');
 assert.deepEqual(item.sources,['WHOOP']);assert.match(item.sourceNote,/two sources recorded the same measure; Xeyo used WHOOP/);
 assert.deepEqual(computeCorrelations({readings:[...whoop,...garmin].reverse(),now:NOW}),both,'input order does not change the answer');
 assert.deepEqual(both.basis.sources,['Garmin','WHOOP']);
 // A live connection beats an import of the same brand.
 const d=dailyData([r('recovery',40,'%','WHOOP import · WHOOP',at(1,'07:00')),r('recovery',70,'%','WHOOP',at(1,'07:05'))],{now:NOW}).series.get('recovery').get(day(1));
 assert.deepEqual([d.value,d.source,d.others],[70,'WHOOP',['WHOOP import · WHOOP']]);
});

test('high-strain days and the next day’s recovery, and live WHOOP cycles land on the day they measured', () => {
 const rand=rng(3),rows=[];
 for(let i=0;i<60;i++){const high=i%3===0;rows.push(r('strain',high?15+rand()*3:6+rand()*6,'','WHOOP import · WHOOP',at(i,'08:00')));rows.push(r('recovery',Math.round(66+rand()*8-4+(i>0&&(i-1)%3===0?-12:0)),'%','WHOOP import · WHOOP',at(i,'07:00')))}
 const item=computeCorrelations({readings:rows,now:NOW}).items.find(i=>i.id==='high_load');
 assert.ok(item);assert.equal(item.metric,'recovery');assert.equal(item.strength,'clear');assert.equal(item.threshold.kind,'strain');
 assert.match(item.finding,/^The day after your top-third strain days \(\d+\.\d or more\), your recovery averages \d+%, \d+ points lower than after lighter days \(n=\d+ vs \d+\)\.$/);
 // A live WHOOP cycle is filed at its end (the next sleep onset, here 01:00 the following night) but measures the day before.
 assert.ok(dailyData([r('strain',14,'','WHOOP',`${day(5)}T01:00:00Z`)],{now:NOW}).series.get('strain').has(day(4)));
});

test('WHOOP journal answers vs next-day recovery: alcohol is found, a no-effect habit is only checked', () => {
 const rand=rng(11),rows=[],behaviors=[];
 for(let i=0;i<60;i++){
  const drank=i%5===0;behaviors.push({day:day(i),question:'Consumed alcohol?',answered_yes:drank},{day:day(i),question:'Hydrated sufficiently?',answered_yes:i%4<2});
  rows.push(r('recovery',Math.round(66+rand()*6-3+(i>0&&(i-1)%5===0?-15:0)),'%','WHOOP',at(i,'07:00')));
 }
 behaviors.push({day:day(3),question:'<b>bad</b>',answered_yes:'yes'});
 const out=computeCorrelations({readings:rows,behaviors,now:NOW}),item=out.items.find(i=>i.id==='behavior:consumed-alcohol');
 assert.ok(item);assert.equal(item.metric,'recovery');assert.equal(item.behavior,'Consumed alcohol?');assert.equal(item.groupA.n,12);
 assert.match(item.finding,/^The day after you answered yes to “Consumed alcohol\?”, your recovery averages \d+%, 1\d points lower than after days you answered no \(n=12 vs 47\)\.$/);
 assert.equal(out.basis.behaviorQuestions,2,'a non-boolean answer is ignored');
 assert.ok(!out.items.some(i=>i.id==='behavior:hydrated-sufficiently')||out.items.find(i=>i.id==='behavior:hydrated-sufficiently').strength!=='clear');
 assert.ok(!out.missing.some(m=>m.id==='behaviors'));
});
