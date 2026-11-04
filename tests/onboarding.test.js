import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {createProfileSaver,createOnboardingSubmitter} from '../src/profile/persistence.js';

const input={representation:'photo',gender:'woman',age:29,peer_opt_in:false};
const owner={id:'10000000-0000-4000-8000-000000000001'};
function harness(handler,options={}){
 const requests=[];
 const db=createClient('https://example.supabase.co','test-publishable-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,init)=>{
  requests.push({url,body:JSON.parse(init.body),headers:new Headers(init.headers)});
  return handler(requests.length,requests.at(-1));
 }}});
 return {requests,save:createProfileSaver({db,getUser:()=>owner,uploadRecord:async()=> 'photo-id',wait:async()=>{},...options})};
}
const ok=row=>new Response(JSON.stringify(row),{status:200,headers:{'Content-Type':'application/json'}});

test('lost response after commit retries the same profile, with comparisons still off',async()=>{
 let stored;
 const {save,requests}=harness((attempt,request)=>{stored={...request.body};if(attempt===1)throw new TypeError('Failed to fetch');return ok(stored)});
 const row=await save(input);
 assert.equal(requests.length,2);assert.deepEqual(requests[0].body,requests[1].body);
 assert.match(requests[0].url,/on_conflict=user_id/);
 assert.match(requests[0].headers.get('prefer'),/resolution=merge-duplicates/);
 assert.equal(row.peer_opt_in,false);assert.equal(row.user_id,owner.id);
});
test('persistent network failure is bounded and manual retry reuses the uploaded photo',async()=>{
 let online=false,uploads=0;
 const {save,requests}=harness((_,request)=>{if(!online)throw new TypeError('Failed to fetch');return ok(request.body)}, {uploadRecord:async()=>{uploads++;return 'same-photo'}});
 const file=new Blob(['photo']);
 await assert.rejects(save(input,file),/choices are still here/);
 assert.equal(requests.length,3);online=true;
 assert.equal((await save(input,file)).photo_record_id,'same-photo');assert.equal(uploads,1);
});
test('permission errors are not retried or reported as a successful save',async()=>{
 const {save,requests}=harness(()=>new Response(JSON.stringify({message:'Permission denied',code:'42501'}),{status:403}));
 await assert.rejects(save(input),/Permission denied/);assert.equal(requests.length,1);
});
test('photo failure can be explicitly skipped without changing other choices',async()=>{
 const {save,requests}=harness((_,request)=>ok(request.body),{uploadRecord:async()=>{throw new TypeError('Failed to fetch')}});
 await assert.rejects(save(input,new Blob(['photo'])),e=>e.code==='PHOTO_UPLOAD_FAILED');
 assert.equal(requests.length,0);
 const row=await save(input,null);assert.equal(row.photo_record_id,null);assert.equal(row.peer_opt_in,false);assert.equal(row.representation,'photo');
});
test('changing the signed-in account during recovery stops the write',async()=>{
 let current=owner;
 const {save,requests}=harness(()=>{throw new TypeError('Failed to fetch')},{getUser:()=>current,wait:async()=>{current={id:'another-user'}}});
 await assert.rejects(save(input),/session has changed/);assert.equal(requests.length,1);
});
test('a failed workspace transition does not repeat a confirmed save',async()=>{
 let saves=0,opens=0;
 const submit=createOnboardingSubmitter({save:async value=>{saves++;return {...value,user_id:owner.id}},done:async row=>{assert.equal(row.user_id,owner.id);if(++opens===1)throw Error('Workspace unavailable')}});
 await assert.rejects(submit(input,null),/Workspace unavailable/);await submit(input,null);
 assert.equal(saves,1);assert.equal(opens,2);
 await submit({...input,peer_opt_in:true},null);assert.equal(saves,2);
});

// The rebuilt flow: pure step logic, progress that survives an OAuth round trip, and funnel tracking.
import {onboardingSteps,toggleWearable,toggleFocus,reduceOnboarding,readProgress,writeProgress,progressKey,resumeStep,connectItems,connectHTML,insightHTML,createOnboardingFlow,openAfterList} from '../src/profile/onboarding.js';
const memory=()=>{const m=new Map();return {m,getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}};
const uid='10000000-0000-4000-8000-0000000000bb';

test('steps: one question per screen, Pro members skip the offer, editing a profile is the short flow',()=>{
 assert.deepEqual(onboardingSteps({wearables:['whoop']}),['wearables','focus','connect','about','community','insight','pro_offer']);
 assert.deepEqual(onboardingSteps({wearables:['none'],plan:{pro:true}}),['wearables','focus','connect','about','community','insight']);
 assert.deepEqual(onboardingSteps({flow:'profile'}),['about','community']);
});
test('wearable choice: None is exclusive and the order follows the list',()=>{
 let w=toggleWearable([],'garmin');w=toggleWearable(w,'whoop');assert.deepEqual(w,['whoop','garmin']);
 assert.deepEqual(toggleWearable(w,'none'),['none']);assert.deepEqual(toggleWearable(['none'],'apple'),['apple']);
 assert.deepEqual(toggleWearable(w,'whoop'),['garmin']);assert.deepEqual(toggleWearable(w,'pebble'),w);
});
test('reducer moves through the steps and keeps choices',()=>{
 const steps=onboardingSteps({});let s={step:'wearables',wearables:[],whoopChoice:null,openAfter:[],draft:{}};
 s=reduceOnboarding(s,{type:'toggle_wearable',id:'whoop',steps});s=reduceOnboarding(s,{type:'next',steps});assert.equal(s.step,'focus');s=reduceOnboarding(s,{type:'next',steps});assert.equal(s.step,'connect');
 s=reduceOnboarding(s,{type:'whoop',choice:'import',steps});s=reduceOnboarding(s,{type:'whoop',choice:'bogus',steps});assert.equal(s.whoopChoice,'import');
 s=reduceOnboarding(s,{type:'open_after',id:'apple',on:true,steps});assert.deepEqual(s.openAfter,['apple']);
 s=reduceOnboarding(s,{type:'back',steps});s=reduceOnboarding(s,{type:'back',steps});assert.equal(s.step,'wearables');
 assert.deepEqual(openAfterList({...s,wearables:['whoop','apple']}),['whoop','apple']);
 assert.deepEqual(openAfterList({...s,wearables:['apple']}),['apple']);
 const last={...s,step:'pro_offer'};assert.equal(reduceOnboarding(last,{type:'next',steps}).step,'pro_offer');
});
test('progress: written without the photo file, read back cleanly, stale or corrupt progress ignored',()=>{
 const storage=memory();
 writeProgress(storage,uid,{step:'connect',wearables:['whoop','garmin'],whoopChoice:'pro',openAfter:[],waitlistPosition:null,saved:false,draft:{gender:'woman',age:'34',representation:'photo',peer_opt_in:false,photo_record_id:null,file:{name:'me.jpg'}}},{now:1000});
 assert.ok(!storage.m.get(progressKey(uid)).includes('me.jpg'));
 const p=readProgress(storage,uid,{now:2000});
 assert.equal(p.step,'connect');assert.deepEqual(p.wearables,['whoop','garmin']);assert.equal(p.whoopChoice,'pro');assert.equal(p.draft.gender,'woman');assert.equal(p.draft.age,'34');
 assert.equal(readProgress(storage,uid,{now:1000+31*86400000}),null);
 storage.setItem(progressKey(uid),'{nope');assert.equal(readProgress(storage,uid),null);
 storage.setItem(progressKey(uid),JSON.stringify({v:1,at:Date.now(),step:'connect',wearables:['whoop','<x>'],whoopChoice:'steal',draft:{gender:'robot',age:'<b>'}}));
 const dirty=readProgress(storage,uid);assert.deepEqual(dirty.wearables,['whoop']);assert.equal(dirty.whoopChoice,null);assert.deepEqual(dirty.draft,{});
 assert.equal(readProgress(null,uid),null);assert.equal(readProgress(storage,null),null);
});
test('resume: a step that no longer applies moves forward; steps after the save need a profile',()=>{
 const pro=onboardingSteps({plan:{pro:true}}),free=onboardingSteps({});
 assert.equal(resumeStep('pro_offer',pro,{hasProfile:true}),'insight');
 assert.equal(resumeStep('insight',free,{hasProfile:false}),'community');
 assert.equal(resumeStep('connect',free),'connect');
});
test('connect: seats left, seats full with waitlist, already connected, providers not switched on',()=>{
 const seatsLeft=connectItems({wearables:['whoop'],seats:{cap:10,taken:7,left:3,mine:false}})[0];
 assert.equal(seatsLeft.full,false);assert.match(connectHTML([seatsLeft]),/<b>3<\/b><small>of 10 live seats left/);
 assert.match(connectHTML([seatsLeft]),/Import your WHOOP export<small class="tag">Free/);
 const full=connectItems({wearables:['whoop'],seats:{cap:10,taken:10,left:0,mine:false}})[0];
 assert.equal(full.full,true);const html=connectHTML([full]);
 assert.match(html,/Pro WHOOP seats are full\./);assert.match(html,/id="whoop-waitlist">Join the waitlist/);
 assert.match(html,/value="pro"  disabled/);assert.match(html,/Weekly Health Report, correlations, full history, CSV export and unlimited Ask Xeyo, don’t need a WHOOP seat/);
 assert.match(connectHTML(connectItems({wearables:['whoop'],seats:{cap:10,left:0},waitlistPosition:4})),/You’re #4 on the waitlist\./);
 assert.match(connectHTML(connectItems({wearables:['whoop'],seats:{cap:10,left:0},waitlisted:true})),/You’re on the waitlist\./);
 assert.equal(connectItems({wearables:['whoop'],seats:{cap:10,left:0,mine:true}})[0].full,false);
 const items=connectItems({wearables:['garmin','fitbit','whoop'],capabilities:{garmin:true,googleHealth:false},connections:[{provider:'garmin'},{provider:'whoop'}]});
 assert.deepEqual(items.map(i=>[i.id,i.status]),[['garmin','connected'],['fitbit','off'],['whoop','connected']]);
 const h=connectHTML(items);assert.match(h,/Not switched on yet/);assert.match(h,/data-open-after="fitbit"/);assert.ok(!h.includes('data-connect="fitbit"'));
 assert.match(connectHTML(connectItems({wearables:['fitbit'],capabilities:{googleHealth:true}})),/data-connect="fitbit"/);
 assert.match(connectHTML(connectItems({wearables:['none']})),/No wearable needed/);
});
test('insight: real insight escaped; without one, no invented numbers',()=>{
 assert.match(insightHTML({title:'<b>HRV</b>',text:'Up',metric:{value:'+9',unit:'ms'}}),/&lt;b&gt;HRV/);
 const empty=insightHTML(null,{wearables:['whoop'],whoopChoice:'import'});
 assert.match(empty,/Not enough readings yet/);assert.match(empty,/Upload your WHOOP export/);assert.ok(!/\d+ ?(ms|%|bpm)/.test(empty));
});
test('tracking: viewed once per step, completed on moving on, OAuth is not a drop, pagehide is',()=>{
 const storage=memory(),events=[];const flow=createOnboardingFlow({userId:uid,storage,track:(e,p)=>events.push([e,p.step,p.via||p.reason||''])});
 assert.equal(flow.mode,'full');assert.equal(flow.state.step,'wearables');
 flow.view();flow.view();flow.dispatch({type:'toggle_wearable',id:'garmin'});flow.next();flow.next();flow.view();
 flow.leave({via:'oauth',provider:'garmin'});assert.equal(flow.drop('pagehide'),false);
 assert.deepEqual(events,[['onboarding_step_viewed','wearables',''],['onboarding_step_completed','wearables',''],['onboarding_step_completed','focus',''],['onboarding_step_viewed','connect',''],['onboarding_step_completed','connect','oauth']]);
 assert.equal(readProgress(storage,uid).step,'connect');
 // Back from Garmin: the same member resumes at connect with their choice.
 const again=[],resumed=createOnboardingFlow({userId:uid,storage,track:(e,p)=>again.push([e,p.step,p.reason||''])});
 assert.deepEqual(resumed.state.wearables,['garmin']);assert.equal(resumed.state.step,'connect');
 resumed.view();assert.equal(resumed.drop('pagehide'),true);
 assert.deepEqual(again,[['onboarding_step_viewed','connect',''],['onboarding_step_dropped','connect','pagehide']]);
});
test('finishing tracks completion once and clears progress; exiting is a drop that leaves no draft behind',()=>{
 const storage=memory(),events=[];
 storage.setItem(progressKey(uid),JSON.stringify({v:1,at:Date.now(),step:'pro_offer',wearables:['whoop'],whoopChoice:'import',saved:true,draft:{gender:'man',age:'40'}}));
 const flow=createOnboardingFlow({userId:uid,storage,profile:{representation:'stats',gender:'man',age:40},track:(e,p)=>events.push(e)});
 assert.equal(flow.state.step,'pro_offer');
 assert.equal(flow.finish({choice:'not_now'}),true);assert.equal(flow.finish(),false);
 assert.deepEqual(events,['onboarding_step_completed','onboarding_completed']);assert.equal(storage.getItem(progressKey(uid)),null);
 assert.equal(flow.drop('pagehide'),false);
 const s2=memory(),e2=[];const f2=createOnboardingFlow({userId:uid,storage:s2,track:e=>e2.push(e)});
 f2.view();f2.dispatch({type:'draft',patch:{age:'51'}});assert.ok(s2.getItem(progressKey(uid)));
 assert.equal(f2.drop('exit'),true);f2.close();assert.equal(s2.getItem(progressKey(uid)),null);assert.deepEqual(e2,['onboarding_step_viewed','onboarding_step_dropped']);
});
test('editing an existing profile is not onboarding: short flow, no funnel events, nothing stored',()=>{
 const storage=memory(),events=[];const flow=createOnboardingFlow({userId:uid,storage,profile:{representation:'photo',gender:'woman',age:29},track:e=>events.push(e)});
 assert.equal(flow.mode,'profile');assert.equal(flow.state.step,'about');assert.equal(flow.state.draft.age,'29');
 flow.view();flow.next();flow.drop('exit');assert.deepEqual(events,[]);assert.equal(storage.m.size,0);
});

test('what to follow: up to six signals in the order picked, unknown ids ignored, kept across a reload',()=>{
 let f=toggleFocus([],'hrv');f=toggleFocus(f,'sleep');assert.deepEqual(f,['hrv','sleep']);
 assert.deepEqual(toggleFocus(f,'hrv'),['sleep']);assert.deepEqual(toggleFocus(f,'pebble'),f);
 const full=['recovery','hrv','resting_hr','sleep','strain','heart_rate'];assert.deepEqual(toggleFocus(full,'steps'),full);
 const storage=memory();const flow=createOnboardingFlow({userId:uid,storage});
 assert.deepEqual(flow.state.focus,full);flow.dispatch({type:'toggle_focus',id:'strain'});flow.dispatch({type:'toggle_focus',id:'spo2'});
 assert.deepEqual(createOnboardingFlow({userId:uid,storage}).state.focus,['recovery','hrv','resting_hr','sleep','heart_rate','spo2']);
 assert.equal(createOnboardingFlow({userId:uid,storage}).state.draft.representation,'digital');
});
