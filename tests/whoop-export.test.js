import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {zipSync,strToU8} from 'fflate';
import {createCollector,parseWhoop,whoopTime,readCSV,readWhoopFiles,readWhoopUploads} from '../src/wearable-import.js';
import {validateImportedReadings,validateImportedBehaviors,validateImportFinish} from '../supabase/functions/health-api/imports.mjs';
// whoop-upload.js imports its stylesheet, as Vite expects; Node only needs the module to load.
registerHooks({load(url,context,next){return url.endsWith('.css')?{format:'module',source:'',shortCircuit:true}:next(url,context)}});
const {whoopUploadPage,whoopPreviewHTML,lastImportHTML}=await import('../src/whoop-upload.js');

const now=Date.parse('2026-11-03T00:00:00Z'),dir=new URL('./fixtures/whoop/',import.meta.url);
const read=path=>readFileSync(new URL(path,dir),'utf8'),FILES=['physiological_cycles.csv','sleeps.csv','workouts.csv','journal_entries.csv'];
const fixtures=()=>FILES.map(name=>({name,text:read(name)})),all=()=>readWhoopFiles(fixtures(),{now});
const file=(path,name=path.split('/').pop())=>new File([readFileSync(new URL(path,dir))],name);
const whoopZip=(extra={})=>new File([zipSync({'my_whoop_data_2026_11_02/':{},...Object.fromEntries(FILES.map(n=>['my_whoop_data_2026_11_02/'+n,strToU8(read(n))])),...extra})],'my_whoop_data_2026_11_02.zip');
const reject=async(promise,pattern)=>assert.rejects(promise,e=>{assert.match(e.message,pattern);return true});
const batches=(rows,size=2000)=>Array.from({length:Math.ceil(rows.length/size)},(_,i)=>rows.slice(i*size,(i+1)*size));

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
  assert.equal(whoopTime('2026-10-24 23:30:00','Europe/Rome'),'2026-10-24T21:30:00.000Z','an IANA zone in summer time');
  assert.equal(whoopTime('2026-10-30 07:04:00','Europe/Rome'),'2026-10-30T06:04:00.000Z','the same zone after the clocks change');
  assert.equal(whoopTime('2026-10-30T07:04:00Z','UTC+01:00'),'2026-10-30T07:04:00.000Z','an explicit offset wins');
  assert.equal(whoopTime('10/30/2026 7:04 PM','UTC+01:00'),'2026-10-30T18:04:00.000Z','a timestamp re-saved by a spreadsheet');
  assert.equal(whoopTime('',''),null);assert.equal(whoopTime('2026-13-40 07:04',''),null);
});

test('a WHOOP export imports recovery, sleep and strain under the live connection’s kinds', () => {
  const c=createCollector(now);
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
  const c=createCollector(now);parseWhoop(cycles,'physiological_cycles.csv',c);
  const rows=await validateImportedReadings({provider:'whoop',rows:c.result().rows},'owner',now);
  assert.ok(rows.length>15);
  assert.ok(rows.every(r=>r.source==='WHOOP import · WHOOP'));
});

test('a CSV that is not part of a WHOOP export is refused with a readable error', () => {
  assert.throws(()=>parseWhoop('date,steps\n2026-10-30,4000','steps.csv',createCollector()),e=>e.code==='not_whoop'&&/steps\.csv isn’t part of a WHOOP export/.test(e.message));
});

test('all four documented WHOOP files: counts per file type, per measurement and the date range', () => {
  const {rows,behaviors,preview}=all();
  assert.deepEqual(preview.files.map(f=>[f.name,f.type,f.rows]),[['physiological_cycles.csv','cycles',7],['sleeps.csv','sleeps',7],['workouts.csv','workouts',5],['journal_entries.csv','journal',18]]);
  assert.deepEqual(preview.counts,{cycles:7,sleeps:7,workouts:5,journal:18},'six nights and one nap; the current cycle has no sleep yet');
  assert.equal(preview.first_day,'2026-10-24');assert.equal(preview.last_day,'2026-11-02','the cycle still running files on the day it will end');
  assert.equal(preview.measurements,rows.length);
  assert.equal(preview.kinds.recovery,6);assert.equal(preview.kinds.strain,7);assert.equal(preview.kinds.sleep,6);assert.equal(preview.kinds.nap,1);assert.equal(preview.kinds.workout,5);assert.equal(preview.kinds.workout_max_hr,5);
  assert.equal(Object.values(preview.kinds).reduce((a,b)=>a+b,0),rows.length);
  const get=(kind,day)=>rows.filter(r=>r.kind===kind&&r.day===day);
  // A cycle that starts at 23:10 on the 29th is the WHOOP day you woke up on: the 30th.
  assert.equal(get('recovery','2026-10-30')[0].value,64);assert.equal(get('recovery','2026-10-30')[0].external_id,'whoop:cycle:2026-10-29T22:10:00Z');
  assert.equal(get('recovery','2026-10-30')[0].observed_at,'2026-10-30T06:04:00.000Z');
  assert.equal(get('recovery','2026-10-25')[0].external_id,'whoop:cycle:2026-10-24T21:30:00Z','summer time (UTC+02:00) before the clocks change');
  assert.equal(get('sleep','2026-10-30')[0].external_id,'whoop:sleep:2026-10-29T22:10:00Z');
  assert.equal(get('nap','2026-10-30')[0].external_id,'whoop:sleep:2026-10-30T13:00:00Z');
  const run=rows.filter(r=>r.external_id==='whoop:workout:2026-11-01T09:15:00Z');
  assert.deepEqual(Object.fromEntries(run.map(r=>[r.kind,[r.value,r.unit]])),{workout:[47,'min'],workout_strain:[11.4,''],workout_energy:[612,'kcal'],workout_avg_hr:[154,'bpm'],workout_max_hr:[181,'bpm']});
  assert.ok(run.every(r=>r.label==='Running'&&r.observed_at==='2026-11-01T09:15:00.000Z'&&r.day==='2026-11-01'),'a workout is filed at its start; the activity stays out of the numbers');
  assert.equal(get('workout','2026-10-31').length,2,'two workouts on one day stay two rows');
  const wine=behaviors.find(b=>b.question==='Had any alcoholic drinks?'&&b.day==='2026-10-31');
  assert.equal(wine.answered_yes,true);assert.equal(wine.notes,'Two glasses of wine, one "small" beer\nat dinner','quoted notes keep commas, quotes and line breaks');
  assert.match(wine.external_id,/^whoop:journal:2026-10-30T22:40:00Z:[a-z0-9]+$/);
  assert.equal(behaviors.filter(b=>b.day==='2026-10-31').length,3);assert.ok(behaviors.every(b=>!('cycle' in b)));
});

test('the WHOOP zip, with its folder and macOS extras, reads the same as the loose CSVs', async () => {
  const zip=await readWhoopUploads([whoopZip({'__MACOSX/my_whoop_data_2026_11_02/._sleeps.csv':strToU8('junk')})],{now}),loose=all();
  assert.deepEqual(zip.rows,loose.rows);assert.deepEqual(zip.behaviors,loose.behaviors);assert.deepEqual(zip.preview.counts,loose.preview.counts);
  assert.deepEqual(zip.preview.uploads,['my_whoop_data_2026_11_02.zip']);
  const both=await readWhoopUploads([whoopZip(),file('sleeps.csv'),file('workouts.csv')],{now});
  assert.equal(both.rows.length,loose.rows.length,'choosing the zip and its CSVs together does not double anything');assert.deepEqual(both.preview.counts,loose.preview.counts);
  const progress=[];await readWhoopUploads(FILES.map(n=>file(n)),{now,onProgress:v=>progress.push(v)});assert.equal(progress.at(-1),1);
});

test('columns are matched by name: reordered, extra and missing columns, unit variants, BOM, CRLF and quotes', () => {
  const text=read('variants/physiological_cycles.csv');assert.equal(text.charCodeAt(0),0xfeff);assert.match(text,/\r\n/);
  const {rows,preview}=readWhoopFiles([{name:'physiological_cycles.csv',text},{name:'workouts.csv',text:read('variants/workouts.csv')}],{now});
  const get=(kind,day)=>rows.find(r=>r.kind===kind&&r.day===day)?.value;
  assert.equal(get('recovery','2026-10-30'),58);assert.equal(get('hrv','2026-10-30'),62);assert.equal(get('resting_hr','2026-10-30'),57);
  assert.equal(get('skin_temperature','2026-10-30'),34,'93.2 °F is 34 °C');assert.equal(get('energy_burned','2026-10-30'),2450,'(kcal) and (cal) are the same unit');
  assert.equal(get('sleep','2026-10-30'),6.7);assert.equal(get('recovery','2026-10-31'),77,'quoted cells');
  assert.equal(rows.find(r=>r.kind==='recovery').external_id,'whoop:cycle:2026-10-30T03:15:00Z','UTC-05:00');
  assert.ok(!rows.some(r=>r.kind==='spo2'),'a missing column is simply absent');
  assert.ok(!rows.some(r=>r.value==='v2'||Number.isNaN(r.value)),'unknown columns are ignored');
  assert.equal(get('workout','2026-10-30'),45.5,'duration from start and end when the column is missing');
  assert.equal(get('workout_energy','2026-10-30'),612,'kilojoules become kcal');
  assert.equal(rows.find(r=>r.kind==='workout').label,'Running, intervals');
  assert.deepEqual(preview.counts,{cycles:2,sleeps:2,workouts:1,journal:0});
  const crlf=readCSV('﻿A,B\r\n"x, ""y""",2\r\n\r\n3,"multi\r\nline"\r\n');assert.deepEqual(crlf.rows,[['A','B'],['x, "y"','2'],['3','multi\r\nline']]);
});

test('malformed files are refused with errors a person can act on', async () => {
  await reject(readWhoopUploads([file('malformed/sleeps-truncated.csv')],{now}),/sleeps-truncated\.csv looks cut off: its last line \(line 5\) has \d+ of 18 columns/);
  await reject(readWhoopUploads([file('malformed/workouts-wrong-headers.csv')],{now}),/workouts-wrong-headers\.csv is missing the columns Workout start time and Duration \(min\)\. WHOOP’s workouts\.csv has columns such as Cycle start time, Workout start time/);
  await reject(readWhoopUploads([file('malformed/steps.csv')],{now}),/steps\.csv isn’t part of a WHOOP export/);
  await reject(readWhoopUploads([file('malformed/empty.csv')],{now}),/empty\.csv is empty/);
  await reject(readWhoopUploads([file('malformed/garbage.zip')],{now}),/garbage\.zip isn’t a readable zip archive/);
  await reject(readWhoopUploads([file('malformed/journal-unclosed.csv')],{now}),/journal-unclosed\.csv looks cut off or damaged: the quoted value starting on line 2 never ends/);
  await reject(readWhoopUploads([new File([zipSync({'notes.txt':strToU8('hello')})],'export.zip')],{now}),/export\.zip has no WHOOP CSV files in it/);
  await reject(readWhoopUploads([new File([zipSync({'steps.csv':strToU8('date,steps\n2026-10-30,4000\n')})],'export.zip')],{now}),/No WHOOP CSV files were found/);
  await reject(readWhoopUploads([new File(['%PDF-1.7'],'export.pdf')],{now}),/export\.pdf isn’t a CSV or zip file/);
  await reject(readWhoopUploads([new File([new Uint8Array([0xff,0xfe,0x43,0,0x79,0])],'physiological_cycles.csv')],{now}),/isn’t a plain-text CSV file/);
  assert.throws(()=>readWhoopFiles([{name:'journal_entries.csv',text:'Cycle start time,Cycle end time,Cycle timezone,Question text,Answered yes,Notes\n'}],{now}),/no measurements or journal answers/,'a header-only export');
  assert.throws(()=>parseWhoop('Cycle start time,Cycle timezone,Heart\n2026-10-30 07:00:00,UTC,1\n','physiological_cycles.csv',createCollector(now)),/is missing the column Recovery score % or Day Strain/);
});

test('an unrelated CSV inside a WHOOP zip is skipped and listed, not fatal', async () => {
  const {preview}=await readWhoopUploads([whoopZip({'my_whoop_data_2026_11_02/readme.csv':strToU8('about,this\nexport,v2\n')})],{now});
  assert.deepEqual(preview.skipped,['readme.csv']);assert.equal(preview.counts.cycles,7);
});

test('uploading again is idempotent: the same start times give the same ids, server-side too', async () => {
  const first=all(),again=all(),ids=r=>r.rows.map(x=>x.kind+'|'+x.external_id).sort();
  assert.deepEqual(ids(first),ids(again));assert.equal(new Set(ids(first)).size,first.rows.length,'every reading has its own key');
  assert.ok(first.rows.every(r=>/^whoop:(cycle|sleep|workout):\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(r.external_id)));
  // A newer export rescored a night and finished the running cycle: same ids, new values.
  const newer=readWhoopFiles([{name:'physiological_cycles.csv',text:read('physiological_cycles.csv').replace(',71,54,74,',',73,54,77,').replace('2026-11-01 23:20:00,,UTC+01:00,,,,,,2.1','2026-11-01 23:20:00,2026-11-02 22:58:00,UTC+01:00,66,55,70,33.5,96.9,8.7')}],{now});
  const saved=[],newSaved=[];for(const b of batches(first.rows))saved.push(...await validateImportedReadings({provider:'whoop',rows:b},'owner',now));
  for(const b of batches(newer.rows))newSaved.push(...await validateImportedReadings({provider:'whoop',rows:b},'owner',now));
  const key=r=>r.kind+'|'+r.source+'|'+r.external_id,keys=new Set(saved.map(key)),records=new Set(saved.map(r=>r.external_id));
  assert.ok(newSaved.every(r=>records.has(r.external_id)),'the newer export names the same cycles, sleeps and workouts');
  assert.deepEqual(newSaved.filter(r=>!keys.has(key(r))).map(r=>r.kind).sort(),['hrv','recovery','resting_hr','skin_temperature','spo2'],'only the finished cycle’s new scores are new rows');
  assert.equal(newSaved.find(r=>r.kind==='recovery'&&r.external_id==='whoop:cycle:2026-10-31T22:05:00Z').value,73);
  assert.equal(newSaved.find(r=>r.kind==='strain'&&r.external_id==='whoop:cycle:2026-11-01T22:20:00Z').value,8.7);
  const b1=validateImportedBehaviors({provider:'whoop',rows:first.behaviors},'owner',now),b2=validateImportedBehaviors({provider:'whoop',rows:again.behaviors},'owner',now);
  assert.deepEqual(b1.map(b=>b.external_id),b2.map(b=>b.external_id));
});

test('the server keeps well-formed WHOOP ids, hashes everything else, and knows the workout kinds', async () => {
  const row={kind:'workout',value:47,unit:'min',observed_at:'2026-11-01T09:15:00Z',day:'2026-11-01',device:'WHOOP',aggregation:'latest daily',external_id:'whoop:workout:2026-11-01T09:15:00Z',label:'Running'};
  const [kept]=await validateImportedReadings({provider:'whoop',rows:[row]},'owner',now);
  assert.equal(kept.external_id,'whoop:workout:2026-11-01T09:15:00Z');assert.ok(!('label' in kept),'health_readings has no label column');
  for(const bad of ['whoop:workout:yesterday','whoop:other:2026-11-01T09:15:00Z','whoop:cycle:1999-01-01T00:00:00Z','whoop:cycle:2027-06-01T00:00:00Z',42])assert.match((await validateImportedReadings({provider:'whoop',rows:[{...row,external_id:bad}]},'owner',now))[0].external_id,/^import:[0-9a-f]{64}$/);
  assert.match((await validateImportedReadings({provider:'apple',rows:[{...row,external_id:'whoop:workout:2026-11-01T09:15:00Z'}]},'owner',now))[0].external_id,/^import:/,'other providers are unchanged');
  for(const [kind,unit,value] of [['workout_strain','',11.4],['workout_energy','kcal',612],['workout_avg_hr','bpm',154],['workout_max_hr','bpm',181],['sleep_disturbances','',9]])assert.equal((await validateImportedReadings({provider:'whoop',rows:[{...row,kind,unit,value}]},'owner',now)).length,1);
  await reject(validateImportedReadings({provider:'whoop',rows:[{...row,value:1500}]},'owner',now),/unsupported measurement/);
  await reject(validateImportedReadings({provider:'whoop',rows:[{...row,kind:'workout_strain',unit:'',value:22}]},'owner',now),/unsupported measurement/);
  await reject(validateImportedReadings({provider:'whoop',rows:[{...row,label:'x'.repeat(101)}]},'owner',now),/unsupported measurement/);
  const two=await validateImportedReadings({provider:'whoop',rows:[row,{...row,external_id:'whoop:workout:2026-11-01T17:00:00Z',observed_at:'2026-11-01T17:00:00Z'}]},'owner',now);assert.equal(two.length,2,'two workouts on one day');
});

test('journal answers are validated against the wearable_behaviors table', () => {
  const ok={external_id:'whoop:journal:2026-10-30T22:40:00Z:abc123',day:'2026-10-31',question:'Had any alcoholic drinks?',answered_yes:true,notes:'Wine'};
  assert.deepEqual(validateImportedBehaviors({provider:'whoop',rows:[ok,{...ok,answered_yes:false}]},'owner',now),[{user_id:'owner',source:'WHOOP import',...ok,answered_yes:false}],'a repeated answer keeps the last');
  assert.equal(validateImportedBehaviors({provider:'whoop',rows:[{...ok,notes:undefined}]},'owner',now)[0].notes,'');
  assert.equal(validateImportedBehaviors({provider:'whoop',rows:Array.from({length:2000},(_,i)=>({...ok,external_id:ok.external_id+i}))},'owner',now).length,2000);
  assert.throws(()=>validateImportedBehaviors({provider:'whoop',rows:Array.from({length:2001},()=>ok)},'owner',now),/at most 2,000/);
  assert.throws(()=>validateImportedBehaviors({provider:'fitbit',rows:[ok]},'owner',now),/WHOOP journal/);
  for(const bad of [{question:''},{question:'q'.repeat(201)},{notes:'n'.repeat(1001)},{answered_yes:'true'},{day:'2026-02-30'},{day:'1999-12-31'},{day:'2027-01-01'},{external_id:'import:abc'},{external_id:'whoop:journal:'+'x'.repeat(190)},{notes:5}])
   assert.throws(()=>validateImportedBehaviors({provider:'whoop',rows:[{...ok,...bad}]},'owner',now),/unsupported journal answer/,JSON.stringify(bad).slice(0,60));
});

test('the import summary for wearable_imports is validated', () => {
  assert.deepEqual(validateImportFinish({provider:'whoop',row_count:143,first_day:'2026-10-24',last_day:'2026-11-02',files:[' sleeps.csv ']},'owner',now),{user_id:'owner',provider:'whoop',row_count:143,first_day:'2026-10-24',last_day:'2026-11-02',files:['sleeps.csv']});
  assert.equal(validateImportFinish({provider:'whoop',row_count:0},'owner',now).first_day,null);
  for(const bad of [{provider:'garmin'},{row_count:-1},{row_count:1.5},{first_day:'2026-11-05',last_day:'2026-11-01'},{first_day:'yesterday'},{files:Array(21).fill('a.csv')},{files:['']},{files:'a.csv'}])
   assert.throws(()=>validateImportFinish({provider:'whoop',row_count:1,first_day:'2026-10-24',last_day:'2026-11-02',files:[],...bad},'owner',now),/not valid/);
});

test('every batch the parser produces passes server validation', async () => {
  const {rows,behaviors}=all();for(const b of batches(rows))assert.equal((await validateImportedReadings({provider:'whoop',rows:b},'owner',now)).length,b.length);
  assert.equal(validateImportedBehaviors({provider:'whoop',rows:behaviors},'owner',now).length,behaviors.length);
});

test('the upload page explains the export, shows the last upload and reminds after 7 days', () => {
  const page=whoopUploadPage({lastImport:null,now});
  for(const text of ['app.whoop.com','App Settings','Data Export','Create Export','expires after 7 days','physiological_cycles.csv','journal_entries.csv','multiple','role="alert"','for="wu-files"','You haven’t uploaded WHOOP data yet'])assert.ok(page.includes(text),text);
  assert.ok(page.indexOf('app.whoop.com')<page.indexOf('App Settings'),'the web dashboard comes first; the phone app is the alternative');
  const last={imported_at:'2026-10-30T09:00:00Z',row_count:1234,first_day:'2026-10-01',last_day:'2026-10-29'};
  assert.ok(!lastImportHTML(last,{now}).includes('wu-remind'),'three days: no reminder');
  const late=lastImportHTML({...last,imported_at:'2026-10-24T09:00:00Z'},{now});assert.match(late,/It’s been 9 days since your last upload/);assert.match(late,/1,234 measurements/);
  assert.match(lastImportHTML({...last,imported_at:'2026-10-27T00:00:00Z'},{now}),/7 days since/,'exactly seven days');
  const preview=whoopPreviewHTML({...all().preview,files:[{name:'<b>x</b>.csv',type:'cycles',rows:1}]});
  assert.match(preview,/<dt>Cycles<\/dt><dd>7<\/dd>/);assert.match(preview,/<dt>Journal answers<\/dt><dd>18<\/dd>/);assert.match(preview,/Recovery<\/span> <b>6<\/b>/);assert.match(preview,/Workout max heart rate/);
  assert.ok(preview.includes('&lt;b&gt;x&lt;/b&gt;.csv')&&!preview.includes('<b>x</b>'),'file names are escaped');
});

// Drop a real WHOOP export (the zip, or its CSVs) into tests/fixtures/whoop/real/ and this test reads it. Never commit it.
const realDir=new URL('real/',dir),real=existsSync(realDir)?readdirSync(realDir).filter(n=>/\.(zip|csv)$/i.test(n)):[];
test('a real WHOOP export, when one is present', {skip:real.length?false:'no files in tests/fixtures/whoop/real/'}, async () => {
  const files=real.map(n=>new File([readFileSync(new URL(n,realDir))],n)),result=await readWhoopUploads(files,{now:Date.now()}),{rows,behaviors,preview}=result;
  console.log('real WHOOP export preview:',JSON.stringify({files:preview.files,skipped:preview.skipped,counts:preview.counts,first_day:preview.first_day,last_day:preview.last_day,kinds:preview.kinds}));
  assert.ok(preview.counts.cycles>0,'cycles were read');assert.ok(rows.some(r=>r.kind==='recovery'));assert.ok(rows.some(r=>r.kind==='sleep'));
  assert.ok(preview.first_day<=preview.last_day);
  for(const b of batches(rows))assert.equal((await validateImportedReadings({provider:'whoop',rows:b},'owner')).length,b.length);
  for(const b of batches(behaviors))validateImportedBehaviors({provider:'whoop',rows:b},'owner');
  const again=await readWhoopUploads(files,{now:Date.now()});assert.deepEqual(again.rows.map(r=>r.external_id),rows.map(r=>r.external_id));
});
