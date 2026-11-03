import test from 'node:test';
import assert from 'node:assert/strict';
import {createCollector,parseWhoop,whoopTime} from '../src/wearable-import.js';
import {validateImportedReadings} from '../supabase/functions/health-api/imports.mjs';

// Header rows as WHOOP's data export writes them (physiological_cycles.csv and sleeps.csv).
const cycles=`Cycle start time,Cycle end time,Cycle timezone,Recovery score %,Resting heart rate (bpm),Heart rate variability (ms),Skin temp (celsius),Blood oxygen %,Day Strain,Energy burned (cal),Max HR (bpm),Average HR (bpm),Sleep onset,Wake onset,Sleep performance %,Respiratory rate (rpm),Asleep duration (min),In bed duration (min),Light sleep duration (min),Deep (SWS) duration (min),REM duration (min),Awake duration (min),Sleep need (min),Sleep debt (min),Sleep efficiency %,Sleep consistency %
2026-10-29 23:10:00,2026-10-30 23:05:00,UTC+01:00,64,55,71,33.4,96.5,12.3,2768,171,68,2026-10-29 23:10:00,2026-10-30 07:04:00,88,15.1,426,474,214,96,116,48,480,32,90,77
2026-10-30 23:05:00,,UTC+01:00,,,,,,4.1,900,120,62,2026-10-30 23:05:00,2026-10-31 06:50:00,,,,,,,,,,,,`;
const sleeps=`Cycle start time,Cycle end time,Cycle timezone,Sleep onset,Wake onset,Sleep performance %,Respiratory rate (rpm),Asleep duration (min),In bed duration (min),Light sleep duration (min),Deep (SWS) duration (min),REM duration (min),Awake duration (min),Sleep need (min),Sleep debt (min),Sleep efficiency %,Sleep consistency %,Nap
2026-10-29 23:10:00,2026-10-30 23:05:00,UTC+01:00,2026-10-29 23:10:00,2026-10-30 07:04:00,88,15.1,426,474,214,96,116,48,480,32,90,77,false
2026-10-29 23:10:00,2026-10-30 23:05:00,UTC+01:00,2026-10-30 14:00:00,2026-10-30 14:30:00,,,28,30,20,0,8,2,,,93,,true`;

test('WHOOP local times become UTC using the cycle timezone', () => {
  assert.equal(whoopTime('2026-10-30 07:04:00','UTC+01:00'),'2026-10-30T06:04:00.000Z');
  assert.equal(whoopTime('2026-10-30 07:04','UTC-05:00'),'2026-10-30T12:04:00.000Z');
  assert.equal(whoopTime('',''),null);
});

test('a WHOOP export imports recovery, sleep and strain under the live connection’s kinds', () => {
  const c=createCollector(Date.parse('2026-11-03T00:00:00Z'));
  parseWhoop(cycles,'physiological_cycles.csv',c);parseWhoop(sleeps,'sleeps.csv',c);
  const rows=c.result().rows,get=(kind,day)=>rows.filter(r=>r.kind===kind&&r.day===day);
  assert.equal(get('recovery','2026-10-30')[0].value,64);
  assert.equal(get('hrv','2026-10-30')[0].value,71);
  assert.equal(get('resting_hr','2026-10-30')[0].unit,'bpm');
  assert.equal(get('sleep','2026-10-30')[0].value,7.1);
  assert.equal(get('sleep','2026-10-30').length,1,'the same night in both files is kept once');
  assert.equal(get('sleep_deep','2026-10-30')[0].value,1.6);
  assert.equal(get('nap','2026-10-30')[0].value,0.47);
  assert.equal(get('strain','2026-10-31')[0].value,4.1,'an unscored day still keeps its strain');
  assert.equal(get('recovery','2026-10-31').length,0,'blank cells are skipped');
  assert.ok(rows.every(r=>r.device==='WHOOP'));
});

test('the server accepts WHOOP export rows and labels them as an import', async () => {
  const c=createCollector(Date.parse('2026-11-03T00:00:00Z'));parseWhoop(cycles,'physiological_cycles.csv',c);
  const rows=await validateImportedReadings({provider:'whoop',rows:c.result().rows},'owner',Date.parse('2026-11-03T00:00:00Z'));
  assert.ok(rows.length>15);
  assert.ok(rows.every(r=>r.source==='WHOOP import · WHOOP'));
});

test('files that are not WHOOP exports are ignored', () => {
  const c=createCollector();
  assert.equal(parseWhoop('date,steps\n2026-10-30,4000','steps.csv',c),0);
});
