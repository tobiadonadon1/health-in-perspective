import test from 'node:test';import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {createCollector,createAppleParser,parseApple,sleepNight} from '../src/wearable-import.js';
import {zipEntries,readEntry} from '../src/zip-reader.js';
import {validateImportedReadings} from '../supabase/functions/health-api/imports.mjs';
const now=Date.parse('2026-10-22T20:00:00Z');
const night=(start,end,value,source='Apple Watch')=>`<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="${source}" startDate="${start}" endDate="${end}" value="HKCategoryValueSleepAnalysis${value}"/>`;
const xml=body=>`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE HealthData [\n<!ELEMENT HealthData (ExportDate,Me,(Record|Workout|ActivitySummary)*)>\n<!ATTLIST Record type CDATA #REQUIRED>\n]>\n<HealthData locale="en_US">\n<ExportDate value="2026-10-22 10:00:00 -0400"/>\n${body}\n</HealthData>\n`;
const sample=xml([
 night('2026-10-20 23:10:00 -0400','2026-10-21 00:40:00 -0400','AsleepCore'),
 night('2026-10-21 00:40:00 -0400','2026-10-21 01:40:00 -0400','AsleepDeep'),
 night('2026-10-21 01:40:00 -0400','2026-10-21 01:52:00 -0400','Awake'),
 night('2026-10-21 01:52:00 -0400','2026-10-21 03:22:00 -0400','AsleepREM'),
 night('2026-10-21 03:22:00 -0400','2026-10-21 06:52:00 -0400','AsleepCore'),
 night('2026-10-20 22:30:00 -0400','2026-10-21 07:00:00 -0400','InBed'),
 '<Record type="HKQuantityTypeIdentifierStepCount" sourceName="Apple Watch" unit="count" startDate="2026-10-21 09:00:00 -0400" endDate="2026-10-21 09:10:00 -0400" value="1200"/>',
 '<Record type="HKQuantityTypeIdentifierStepCount" sourceName="Apple Watch" unit="count" startDate="2026-10-21 12:00:00 -0400" endDate="2026-10-21 12:30:00 -0400" value="3300">\n <MetadataEntry key="HKMetadataKeyWasUserEntered" value="0"/>\n</Record>',
 '<Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Apple Watch" unit="count/min" startDate="2026-10-21 09:00:00 -0400" endDate="2026-10-21 09:00:00 -0400" value="70"/>',
 '<Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Apple Watch" unit="count/min" startDate="2026-10-21 10:00:00 -0400" endDate="2026-10-21 10:00:00 -0400" value="90"/>',
 '<Record type="HKQuantityTypeIdentifierAppleSleepingWristTemperature" sourceName="Apple Watch" unit="degC" startDate="2026-10-21 01:00:00 -0400" endDate="2026-10-21 06:00:00 -0400" value="35.12"/>',
 '<Record type="HKQuantityTypeIdentifierActiveEnergyBurned" sourceName="Apple Watch" unit="Cal" startDate="2026-10-21 09:00:00 -0400" endDate="2026-10-21 09:10:00 -0400" value="40"/>',
 '<ActivitySummary dateComponents="2026-10-21" activeEnergyBurned="512.5" activeEnergyBurnedGoal="600" activeEnergyBurnedUnit="Cal" appleExerciseTime="31"/>',
 '<Record type="HKQuantityTypeIdentifierStepCount" sourceName="Apple Watch" unit="count" startDate="2020-01-01 09:00:00 -0400" endDate="2020-01-01 09:10:00 -0400" value="99999"/>',
 '<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30"/>'
].join('\n'));
const byKind=rows=>Object.fromEntries(rows.map(r=>[r.kind,r]));
test('Apple Watch sleep stages, steps, rings energy and wrist temperature import as nightly and daily totals',()=>{
 const c=createCollector(now);parseApple(sample,c);const r=byKind(c.result().rows);
 assert.equal(r.sleep.value,7.5);assert.equal(r.sleep_light.value,5);assert.equal(r.sleep_deep.value,1);assert.equal(r.sleep_rem.value,1.5);assert.equal(r.sleep_awake.value,12);assert.equal(r.sleep_awake.unit,'min');
 assert.equal(r.sleep.aggregation,'daily total');assert.equal(r.steps.value,4500);assert.equal(r.heart_rate.value,80);assert.equal(r.skin_temperature.value,35.12);
 assert.equal(r.active_energy.value,512.5,'activity rings total wins; raw energy samples are not double counted');assert.equal(c.result().rows.filter(x=>x.kind==='active_energy').length,1);
});
test('a night that starts before midnight is one night, assigned to the day it ends',()=>{assert.equal(sleepNight('2026-10-20 23:10:00 -0400'),'2026-10-21');assert.equal(sleepNight('2026-10-21 06:52:00 -0400'),'2026-10-21');assert.equal(sleepNight('2026-10-21 14:00:00 -0400'),'2026-10-21');assert.equal(sleepNight('nope'),'')});
test('streaming parser gives identical results regardless of chunk boundaries',()=>{
 const whole=createCollector(now);parseApple(sample,whole);const expected=JSON.stringify(whole.result());
 for(const size of [1,7,64,333]){const c=createCollector(now),p=createAppleParser(c);for(let i=0;i<sample.length;i+=size)p.push(sample.slice(i,i+size));p.end();assert.equal(JSON.stringify(c.result()),expected,'chunk size '+size)}
});
test('truncated Apple exports are rejected instead of silently importing part of the file',()=>{const c=createCollector(now),p=createAppleParser(c);p.push(sample.slice(0,sample.length/2));assert.throws(()=>p.end(),/complete/)});
test('zip reader streams deflated and stored export.xml entries without unzipping the whole archive',async()=>{
 for(const level of [0,6]){
  const archive=zipSync({'apple_health_export/export_cda.xml':strToU8('<ClinicalDocument/>'),'apple_health_export/workout-routes/route_1.gpx':strToU8('<gpx/>'),'apple_health_export/export.xml':strToU8(sample)},{level});
  const file=new Blob([archive]),entries=await zipEntries(file);assert.deepEqual(entries.map(e=>e.name).sort(),['apple_health_export/export.xml','apple_health_export/export_cda.xml','apple_health_export/workout-routes/route_1.gpx']);
  const entry=entries.find(e=>/(^|\/)export\.xml$/.test(e.name)),c=createCollector(now),p=createAppleParser(c),decoder=new TextDecoder();let progress=0;
  await readEntry(file,entry,b=>p.push(decoder.decode(b,{stream:true})),f=>progress=f);p.push(decoder.decode());p.end();
  assert.equal(byKind(c.result().rows).sleep.value,7.5);assert.equal(progress,1);
 }
 await assert.rejects(zipEntries(new Blob([new Uint8Array(100)])),/incomplete/);
});
test('server accepts the new Apple Watch kinds in larger batches and still bounds values',async()=>{
 const row=(kind,unit,value)=>({kind,unit,value,observed_at:'2026-10-21T10:00:00Z',device:'Apple Watch',aggregation:'daily total'});
 const rows=await validateImportedReadings({provider:'apple',rows:[row('steps','',4500),row('active_energy','kcal',512.5),row('skin_temperature','°C',35.1)]},'owner',now);assert.equal(rows.length,3);
 await validateImportedReadings({provider:'apple',rows:Array.from({length:2000},()=>row('steps','',1))},'owner',now);
 await assert.rejects(validateImportedReadings({provider:'apple',rows:Array.from({length:2001},()=>row('steps','',1))},'owner',now),/at most 2,000/);
 await assert.rejects(validateImportedReadings({provider:'apple',rows:[row('steps','',250000)]},'owner',now));
});
