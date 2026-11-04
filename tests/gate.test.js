import test from 'node:test';
import assert from 'node:assert/strict';
import {FEATURES,proGate,lockedFrom,quotaNote,upgradeDialog,seatLine,proCard,historyStrip,proShowcase} from '../src/pro/gate.js';
import {createTracker,sanitizeProps} from '../src/analytics.js';

const preview='<ul class="ex"><li>Late workout → HRV <b>−8 ms</b></li><li><button>Open</button></li></ul>';
test('every Pro feature has a title and one value line',()=>{
 assert.deepEqual(Object.keys(FEATURES),['whoop_live','weekly_report','correlations','full_history','csv_export','smart_ai']);
 for(const f of Object.values(FEATURES)){assert.ok(f.title.length>3);assert.ok(f.value.length>20&&!f.value.includes('\n'))}
});
test('locked: the example is blurred behind the veil, hidden from assistive tech and inert, with one upgrade button',()=>{
 const html=proGate({feature:'correlations',preview});
 assert.match(html,/<div class="pro-gate-preview" aria-hidden="true" inert><ul class="ex">/);
 assert.match(html,/>Example</);assert.ok(html.includes(FEATURES.correlations.value));
 assert.match(html,/<button type="button" class="btn" data-action="upgrade" data-feature="correlations">Upgrade<\/button>/);
 assert.equal(html.match(/data-action="upgrade"/g).length,1);
 assert.ok(html.indexOf('pro-gate-veil')>html.indexOf('</ul>'),'the call to action comes after the example, outside it');
 assert.match(proGate({feature:'csv_export',preview,compact:true}),/class="pro-gate compact"/);
});
test('unlocked returns the preview untouched',()=>{assert.equal(proGate({feature:'correlations',preview,locked:false}),preview)});
test('note and feature id are escaped; the caller-made preview is trusted HTML',()=>{
 const html=proGate({feature:'x"><img src=x onerror=alert(1)>',preview,note:'<script>alert(1)</script> & co'});
 assert.ok(!html.includes('<script>')&&!html.includes('<img src=x'));
 assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; co/);
 assert.match(html,/data-feature="x&quot;&gt;&lt;img/);
});
test('lockedFrom recognises pro_required and quota errors only',()=>{
 const err=(code,feature)=>Object.assign(Error('locked'),{code,feature,status:402});
 assert.equal(lockedFrom(err('pro_required','weekly_report')),'weekly_report');
 assert.equal(lockedFrom(err('quota','smart_ai')),'smart_ai');
 assert.equal(lockedFrom(err('quota')),'smart_ai');
 assert.equal(lockedFrom(Object.assign(err('quota','smart_ai'),{pro:true})),null,'a Pro member out of allowance has nothing to upgrade to');
 assert.equal(lockedFrom(err('pro_required','not_a_feature')),null);
 assert.equal(lockedFrom(err('seats_full','whoop_live')),null);
 assert.equal(lockedFrom(Error('Failed to fetch')),null);assert.equal(lockedFrom(null),null);
});
test('quota note and seat line say plain numbers',()=>{
 assert.equal(quotaNote({code:'quota',used:100,quota:100,resets:'2026-12-01'}),'You have used this month’s free AI. It resets on 1 December.');
 assert.equal(quotaNote({code:'quota'}),'You have used this month’s free AI.');
 assert.equal(quotaNote({code:'pro_required'}),'');
 assert.equal(seatLine({cap:10,taken:7,left:3}),'3 of 10 live seats left');
 assert.equal(seatLine({cap:10,taken:10,left:0}),'Pro WHOOP seats are full');
 assert.equal(seatLine({cap:10,left:0,mine:true}),'Your live WHOOP seat is reserved.');
 assert.equal(seatLine(null),'');
});
test('upgrade dialog: what Pro adds, the price, Upgrade and an equal Not now',()=>{
 const html=upgradeDialog({feature:'correlations',seats:{cap:10,taken:7,left:3}});
 assert.match(html,/<h2 id="dialog-title">Correlations across wearables is part of Xeyo Pro\.<\/h2>/);
 for(const f of Object.values(FEATURES))assert.ok(html.includes(f.title));
 assert.match(html,/€5<\/b><small>\/month/);assert.match(html,/3 of 10 live seats left/);
 assert.match(html,/data-action="close">Not now</);assert.match(html,/data-action="checkout" data-feature="correlations"/);
 const full=upgradeDialog({feature:'whoop_live',seats:{cap:10,taken:10,left:0}});
 assert.match(full,/seats are full/);assert.match(full,/data-action="whoop-waitlist"/);assert.match(full,/data-action="checkout"/);
 const pro=upgradeDialog({feature:'csv_export',plan:{pro:true}});
 assert.match(pro,/already have Xeyo Pro/);assert.ok(!pro.includes('data-action="checkout"'));
});

test('tracker: fire-and-forget, valid names only, no health values or free text',async()=>{
 const rows=[];let t=1000;
 const {track,session}=createTracker({insert:async row=>{rows.push(row)},sessionId:'s-1',now:()=>t});
 assert.equal(session,'s-1');
 t=1500;assert.equal(track('onboarding_step_viewed',{step:'connect',index:2,provider:'garmin',wearables:['whoop','garmin']}),true);
 assert.deepEqual(rows[0],{event:'onboarding_step_viewed',step:'connect',props:{index:2,provider:'garmin',wearables:['whoop','garmin'],ms:500},session_id:'s-1'});
 assert.equal(track('Bad Event'),false);assert.equal(track('ab'),false);assert.equal(rows.length,1);
 assert.deepEqual(sanitizeProps({hrv_value:61,recovery:72,age:34,note:'slept badly',text:'free text here',rhr:50,ratio:0.42,label:'Hello there, I feel tired',ok:true,count:3}),{ok:true,count:3});
 const big=Object.fromEntries(Array.from({length:80},(_,i)=>['k'+i,'x'.repeat(40)]));
 assert.ok(JSON.stringify(sanitizeProps(big)).length<=1500);
 const failing=createTracker({insert:()=>Promise.reject(Error('offline'))});assert.equal(failing.track('pro_offer_skipped'),true);
 const throwing=createTracker({insert:()=>{throw Error('boom')}});assert.equal(throwing.track('pro_offer_skipped'),false);
 await new Promise(r=>setTimeout(r,5));
});

test('Pro card: the member’s hidden history as a count and a timeline, four tiles, the AI meter and one checkout button',()=>{
 const now=Date.parse('2026-11-04T12:00:00Z');
 const status={hidden:{readings:1284,since:'2025-11-04'},usage:{ai:{tier:'free',model:'claude-haiku-5-5',modelName:'Claude Haiku',percent:34}}};
 const html=proCard({feature:'full_history',title:'See your HRV over a year',body:'Free shows 30 days.',status,now});
 assert.match(html,/<b>1,284<\/b> of your readings from before the last 30 days are saved and waiting/);
 assert.match(html,/Since 4 Nov 2025/);
 assert.equal(html.match(/<li class="pro-tile/g).length,4);
 assert.match(html,/pro-tile is-focus">.*?<b>1 year\+<\/b>/);
 assert.match(html,/34% used/);assert.match(html,/aria-label="34% of this month’s free AI used"/);
 assert.equal(html.match(/data-action="upgrade"/g).length,1);assert.match(html,/Upgrade to Pro · €5\/month/);
 assert.ok(!html.includes('$'),'the price is in euros');
 const bare=proCard({feature:'whoop_live'});
 assert.ok(!bare.includes('pro-insight')&&!bare.includes('pro-ai'),'no invented numbers without a status');
 assert.match(bare,/A year with Pro/);
 assert.ok(!proCard({status:{usage:{ai:{tier:'pro',percent:10}}}}).includes('pro-ai'),'Pro members never see the Free meter');
 assert.match(historyStrip({readings:5,since:'2026-09-06'},now),/pro-history-free" style="flex-basis:50%/,'two months of data: the 30 lit days are half the bar');
 assert.match(historyStrip(null,now),/pro-history-free" style="flex-basis:8%/,'no data yet: a year, with 30 days lit');
});

test('Pro showcase: moving glass with the price, six tiles, the focused feature first and in full',()=>{
 const html=proShowcase({focus:'correlations',seats:{cap:10,left:3}});
 assert.match(html,/class="pro-glass pro-live"/);assert.match(html,/class="pro-fluid" aria-hidden="true"/);assert.match(html,/€5<\/b><small>\/month/);
 assert.equal((html.match(/data-pro-pick=/g)||[]).length,6);
 assert.match(html,/data-pro-pick="correlations"[^>]*aria-pressed="true"/);assert.match(html,/<b>Correlations across wearables<\/b>/);
 assert.match(html,/3 of 10 live seats left/);assert.ok(!html.includes('$'));
 assert.match(proCard({feature:'full_history'}),/class="pro-card pro-live"/);
});
