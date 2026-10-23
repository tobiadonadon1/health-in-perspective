import test from 'node:test';import assert from 'node:assert/strict';
import {nearestPoint,chartRows} from '../src/metric-detail.js';
import {metrics} from '../src/metrics.js';import {metricExplanation} from '../src/metric-explanations.js';
import {journalContext,handleJournal} from '../supabase/functions/health-api/journal.mjs';
import {askProvider} from '../supabase/functions/health-api/chat.mjs';
const now=Date.parse('2026-10-23T12:00:00Z');
const row=(date,value,source='WHOOP',unit='ms')=>({kind:'hrv',value,source,unit,observed_at:date});
test('chart scrubbing follows timestamps across gaps, clamps endpoints and supports one or no reading',()=>{
 const rows=['2026-10-01','2026-10-02','2026-10-20'].map((d,i)=>row(d,i));
 assert.equal(nearestPoint(rows,Date.parse('2026-10-03')),1);assert.equal(nearestPoint(rows,Date.parse('2026-10-19')),2);
 assert.equal(nearestPoint(rows,0),0);assert.equal(nearestPoint(rows,Date.now()+1e15),2);assert.equal(nearestPoint([rows[0]],0),0);assert.equal(nearestPoint([],now),-1);
});
test('chart never combines sources, methods or future/missing values',()=>{
 const last=row('2026-10-23T10:00:00Z',70);const rows=[last,row('2026-10-22',null),row('2026-10-22',300,'Apple'),row('2026-10-21',2,'WHOOP','s'),row('2026-10-24',4),row('2026-10-01',10),row('2026-10-20',50)];
 assert.deepEqual(chartRows(rows,last,7,now).map(r=>r.value),[50,70]);assert.equal(chartRows(rows,last,30,now).length,3);
 for(const metric of metrics){const e=metricExplanation(metric.kind);assert.ok(e.meaning.length>15);assert.match(e.url,/^https:\/\//);}
});
test('journal context includes comparable latest and 7/30 day summaries, excludes identity and missing/future readings',()=>{
 const rows=[row('2026-10-23T08:00:00Z',60),row('2026-10-23T09:00:00Z',80),row('2026-10-20',50),row('2026-10-05',30),row('2026-10-01',null),row('2026-10-24',999),row('2026-10-23',22,'Apple')];
 const c=journalContext(rows,now);assert.equal(c.length,2);assert.equal(c[0].mean,50);assert.equal(c[0].recent_7_day_mean,60);assert.equal(c[0].recent_recorded_days,2);assert.equal(c[0].latest.value,80);assert.equal(c[1].source,'Apple');assert.deepEqual(journalContext([],now),[]);
});
test('journal AI uses explicit consent, observation language and fixed provider endpoints',async()=>{
 for(const [provider,result] of [['openai',{output:[{type:'message',content:[{type:'output_text',text:'A reflection.'}]}]}],['anthropic',{content:[{type:'text',text:'A reflection.'}]}],['gemini',{candidates:[{content:{parts:[{text:'A reflection.'}]}}]}]]){
  let sent;const answer=await askProvider({provider,model:'test-model',key:'test-private-key',purpose:'journal',messages:[{role:'user',content:'I feel high load.'}],context:null},async(url,init)=>{sent=JSON.parse(init.body);assert.ok(!url.includes('test-private-key'));return Response.json(result)});
  assert.equal(answer,'A reflection.');const payload=JSON.stringify(sent);assert.match(payload,/No wearable data was shared/);assert.match(payload,/Never diagnose/);assert.match(payload,/self-report/);assert.ok(!payload.includes('test-private-key'));
 }
});
test('journal unavailable entry is rejected before provider lookup or decryption',async()=>{
 const seen=[];const client={from(table){seen.push(table);return {select(){return this},eq(key,value){seen.push([key,value]);return this},maybeSingle:async()=>({data:null,error:null})}}};
 await assert.rejects(()=>handleJournal({action:'journal-reflect',entry_id:'11111111-1111-4111-8111-111111111111'},{client,userId:'owner',unseal:()=>{throw Error('should not run')}}),/unavailable/);
 assert.deepEqual(seen,['journal_entries',['user_id','owner'],['id','11111111-1111-4111-8111-111111111111']]);
});
