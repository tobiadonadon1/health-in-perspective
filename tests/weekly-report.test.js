import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWeeklyStats,weeklyReport,reportEmail,sendReportEmail,parseAIReport,previousWeekStart,mondayOf,LIMITS} from '../supabase/functions/health-api/weeklyreport.mjs';
import {INCLUDED_MODEL} from '../supabase/functions/health-api/chat.mjs';

// Week of Mon Oct 26 – Sun Nov 1 2026, compared with Sep 28 – Oct 25. WHOOP every day.
const NOW=Date.parse('2026-11-03T08:00:00Z'),WEEK='2026-10-26';
const day=i=>new Date(Date.parse('2026-09-28T00:00:00Z')+i*86400000).toISOString().slice(0,10);
function data({weekSleep=6.4,priorSleep=7,weekRecovery=58,priorRecovery=65,weekHrv=54,priorHrv=60}={}){
 const rows=[];
 for(let i=0;i<35;i++){const week=i>=28,id='s'+i,end=`${day(i)}T07:00:00Z`;
  rows.push({kind:'sleep',value:week?weekSleep:priorSleep,unit:'hours',source:'WHOOP',observed_at:end,external_id:id},{kind:'sleep_awake',value:30,unit:'min',source:'WHOOP',observed_at:end,external_id:id});
  rows.push({kind:'recovery',value:(week?weekRecovery:priorRecovery)+(i%2?1:-1),unit:'%',source:'WHOOP',observed_at:end,external_id:'c'+i},{kind:'hrv',value:week?weekHrv:priorHrv,unit:'ms',source:'WHOOP',observed_at:end,external_id:'c'+i},{kind:'resting_hr',value:52,unit:'bpm',source:'WHOOP',observed_at:end,external_id:'c'+i});
 }
 return rows;
}
const anthropicReply=text=>async()=>({ok:true,status:200,json:async()=>({content:[{type:'text',text}],stop_reason:'end_turn'})});
const KEY='sk-ant-'+'k'.repeat(30);

test('weekly stats compare a Monday-start week with the 4 weeks before it', () => {
 const s=buildWeeklyStats({readings:data(),weekStart:WEEK,timeZone:'Europe/Rome',now:NOW});
 assert.equal(s.weekStart,WEEK);assert.equal(s.weekEnd,'2026-11-01');assert.equal(s.priorStart,'2026-09-28');assert.equal(s.daysRecorded,7);assert.deepEqual(s.sources,['WHOOP']);
 const sleep=s.metrics.find(m=>m.kind==='sleep');
 assert.deepEqual([sleep.mean,sleep.priorMean,sleep.change,sleep.changePct,sleep.days,sleep.priorDays,sleep.comparable],[6.4,7,-0.6,-8.6,7,28,true]);
 assert.equal(s.metrics.find(m=>m.kind==='resting_hr').changePct,0);
 // Bedtime = 07:00 UTC (08:00 Rome) − 6.4 h asleep − 30 min awake = 01:06 Rome, the same every night.
 assert.deepEqual([s.bedtime.averageClock,s.bedtime.spreadMinutes,s.bedtime.nights],['01:06',0,7]);
 assert.equal(buildWeeklyStats({readings:data(),weekStart:'2026-10-29',now:NOW}).weekStart,WEEK,'a mid-week date snaps to its Monday');
 assert.throws(()=>buildWeeklyStats({readings:[],weekStart:'2026-02-30'}),/valid week/);
 assert.equal(mondayOf('2026-11-01'),'2026-10-26');assert.equal(previousWeekStart({now:NOW,timeZone:'UTC'}),WEEK);
 // Only Apple data: no wake time, so bedtime is not derived.
 assert.equal(buildWeeklyStats({readings:data().map(r=>({...r,source:'Apple Health import · Watch'})),weekStart:WEEK,now:NOW}).bedtime,null);
});

test('without AI the report is deterministic, personal and has exactly three actions', async () => {
 const stats=buildWeeklyStats({readings:data(),weekStart:WEEK,now:NOW}),report=await weeklyReport({stats});
 assert.equal(report.generatedBy,'rules');assert.equal(report.actions.length,3);
 assert.ok(report.actions.some(a=>a.why==='Your sleep averaged 6.4 h, 0.6 h under your previous 4 weeks (7.0 h).'),JSON.stringify(report.actions));
 assert.ok(report.actions.some(a=>/Recovery averaged 58%, 7 points under/.test(a.why)));
 assert.match(report.summary,/^For Oct 26 – Nov 1, Xeyo had readings on 7 of 7 days from WHOOP\. Your sleep averaged 6\.4 h \(previous 4 weeks: 7\.0 h\)/);
 assert.deepEqual(await weeklyReport({stats}),report,'same stats, same report');
 for(const a of report.actions)assert.ok(a.title&&a.why.length<=LIMITS.why&&a.how.length<=LIMITS.how);
});

test('an empty week never calls the AI and still returns three actions', async () => {
 let calls=0;const stats=buildWeeklyStats({readings:[],weekStart:WEEK,now:NOW});
 const report=await weeklyReport({stats,ai:{provider:'anthropic',model:INCLUDED_MODEL,key:KEY,fetcher:async()=>{calls++}}});
 assert.equal(calls,0);assert.equal(report.generatedBy,'rules');assert.equal(report.actions.length,3);assert.equal(report.actions[0].title,'Connect or sync a wearable');
});

test('the AI path calls the Anthropic Messages API like the included Xeyo AI, and its answer is validated', async () => {
 const stats=buildWeeklyStats({readings:data(),weekStart:WEEK,now:NOW});const calls=[];
 const answer={summary:'**Sleep** dipped to 6.4 h this week, 0.6 h under your usual, and recovery followed at 58%.',actions:[
  {title:'## Win back sleep',why:'Your sleep averaged 6.4 h, 0.6 h under your previous 4 weeks.',how:'Start winding down 30 minutes earlier on two nights. '+'More detail. '.repeat(40)},
  {title:'Ease the load',why:'Recovery averaged 58%, 7 points under your previous 4 weeks.',how:'Keep the day after your hardest session light.'},
  {title:'Watch HRV',why:'Your HRV averaged 54 ms, 10% under your previous 4 weeks.',how:'Add one earlier night and see whether it picks up.'},
  {title:'A fourth one',why:'This should be dropped by the validator.',how:'Because exactly three are kept.'}]};
 const fetcher=async(url,options)=>{calls.push({url,options});return anthropicReply('```json\n'+JSON.stringify(answer)+'\n```')()};
 const report=await weeklyReport({stats,ai:{provider:'anthropic',model:INCLUDED_MODEL,key:KEY,fetcher}});
 assert.equal(calls.length,1);const {url,options}=calls[0],body=JSON.parse(options.body);
 assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(options.method,'POST');
 assert.equal(options.headers['x-api-key'],KEY);assert.equal(options.headers['anthropic-version'],'2023-06-01');
 assert.equal(body.model,'claude-haiku-5-5');assert.match(body.system,/exactly 3 actions/);assert.match(body.system,/not medical advice/);
 const input=JSON.parse(body.messages[0].content);assert.equal(input.metrics.find(m=>m.measure==='Sleep').this_week_mean,6.4);
 assert.equal(report.generatedBy,'ai');assert.equal(report.model,INCLUDED_MODEL);assert.equal(report.actions.length,3);
 assert.equal(report.summary,'Sleep dipped to 6.4 h this week, 0.6 h under your usual, and recovery followed at 58%.');
 assert.equal(report.actions[0].title,'Win back sleep');assert.ok(report.actions[0].how.length<=LIMITS.how&&report.actions[0].how.endsWith('…'));
 assert.ok(!report.actions.some(a=>a.title==='A fourth one'));
});

test('malformed or failed AI answers fall back to the deterministic report', async () => {
 const stats=buildWeeklyStats({readings:data(),weekStart:WEEK,now:NOW}),rules=await weeklyReport({stats});
 for(const fetcher of [anthropicReply('Sure! Here is your report: {summary: oops'),anthropicReply(JSON.stringify({summary:'ok',actions:[]})),anthropicReply(JSON.stringify({summary:'A fine and long enough summary of the week.',actions:'none'})),
  async()=>({ok:false,status:500,json:async()=>({})}),async()=>{throw Error('network down')},async()=>({ok:true,status:200,json:async()=>{throw SyntaxError('bad')}})]){
  const report=await weeklyReport({stats,ai:{provider:'anthropic',model:INCLUDED_MODEL,key:KEY,fetcher}});
  assert.equal(report.generatedBy,'rules');assert.equal(report.actions.length,3);assert.equal(report.summary,rules.summary);assert.ok(report.aiError);
 }
 // Fewer than three usable AI actions are topped up from the data-driven ones, so there are always exactly three.
 const partial=await weeklyReport({stats,ai:{model:INCLUDED_MODEL,key:KEY,fetcher:anthropicReply(JSON.stringify({summary:'Your sleep was shorter than usual this week.',actions:[{title:'Sleep a bit more',why:'Sleep averaged 6.4 h this week.',how:'Go to bed 20 minutes earlier.'},{title:'x',why:'',how:''}]}))}});
 assert.equal(partial.generatedBy,'ai');assert.equal(partial.actions.length,3);assert.equal(partial.actions[0].title,'Sleep a bit more');assert.deepEqual(partial.actions.slice(1),rules.actions.slice(0,2));
 assert.throws(()=>parseAIReport('no json here'),/not valid JSON/);
});

test('the email escapes member and AI text, has no images or tracking, and only links to a safe URL', async () => {
 const stats=buildWeeklyStats({readings:data(),weekStart:WEEK,now:NOW});
 const ai=await weeklyReport({stats,ai:{model:INCLUDED_MODEL,key:KEY,fetcher:anthropicReply(JSON.stringify({summary:'Sleep fell <img src=x onerror=alert(1)> while load & stress "rose" as 6.4 < 7.0.',actions:[1,2,3].map(i=>({title:`Step ${i} <script>alert(1)</script>`,why:`Because 6.4 h < 7.0 h & "x" ${i}.`,how:'Try <a href="https://evil.example">this</a> gently.'}))}))}});
 const crafted={...ai,actions:[...ai.actions.slice(0,2),{title:'Raw <script>alert(1)</script>',why:'Unsanitized text still renders inert.',how:'Escaped, not stripped.'}],patterns:[{finding:'After “<b>x</b>” & co, recovery averages 50%.',strength:'possible'}]};
 const {subject,html,text}=reportEmail({report:crafted,appUrl:'https://app.xeyo.ai'});
 assert.equal(subject,'Your Xeyo week · Oct 26 – Nov 1');
 for(const bad of ['<script','<img','onerror','<b>','https://evil.example'])assert.ok(!html.includes(bad),bad);
 assert.match(html,/Raw &lt;script&gt;alert\(1\)&lt;\/script&gt;/);assert.match(html,/6\.4 &lt; 7\.0/);assert.match(html,/&amp; &quot;x&quot;/);assert.match(html,/&lt;b&gt;x&lt;\/b&gt;/);
 assert.match(html,/<html lang="en">/);assert.match(html,/<th scope="col"/);assert.match(html,/href="https:\/\/app\.xeyo\.ai\/"/);assert.match(html,/not medical advice/);
 assert.match(text,/Three things to try:\n1\. Step 1/);assert.match(text,/Open Xeyo: https:\/\/app\.xeyo\.ai\//);
 const unsafe=reportEmail({report:crafted,appUrl:'javascript:alert(1)'});assert.ok(!unsafe.html.includes('href=')&&!unsafe.text.includes('javascript:'));
});

test('sendReportEmail posts to Resend with the key, and reports failures', async () => {
 const calls=[],email={subject:'S',html:'<p>h</p>',text:'t'};
 const ok=await sendReportEmail({to:'member@example.com',email,apiKey:'re_test',from:'Xeyo <reports@xeyo.ai>',idempotencyKey:'weekly:u:2026-10-26',fetcher:async(url,o)=>{calls.push({url,o});return {ok:true,status:200,json:async()=>({id:'em_1'})}}});
 assert.deepEqual(ok,{id:'em_1'});assert.equal(calls[0].url,'https://api.resend.com/emails');assert.equal(calls[0].o.method,'POST');
 assert.equal(calls[0].o.headers.Authorization,'Bearer re_test');assert.equal(calls[0].o.headers['Idempotency-Key'],'weekly:u:2026-10-26');
 assert.deepEqual(JSON.parse(calls[0].o.body),{from:'Xeyo <reports@xeyo.ai>',to:['member@example.com'],subject:'S',html:'<p>h</p>',text:'t'});
 await assert.rejects(sendReportEmail({to:'member@example.com',email,apiKey:'re_test',from:'x@xeyo.ai',fetcher:async()=>({ok:false,status:422})}),/could not be sent \(422\)/);
 await assert.rejects(sendReportEmail({to:'not an email',email,apiKey:'re_test',from:'x@xeyo.ai',fetcher:async()=>({ok:true})}),/valid recipient/);
 await assert.rejects(sendReportEmail({to:'a@b.co',email,apiKey:'',from:'x@xeyo.ai'}),/not configured/);
});
