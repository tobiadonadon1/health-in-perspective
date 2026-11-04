import {escapeHTML as esc} from '../domain.js';
import {representations,validateProfile,digitalFigure} from './domain.js';
import {createOnboardingSubmitter} from './persistence.js';
import {FEATURES,PRICE,seatLine} from '../pro/gate.js';

// Onboarding, one question per screen: wearables → connect → about you → community → first insight → Pro offer.
// The step logic below is pure (no DOM), so it is tested on its own; openOnboarding at the bottom only draws it.

export const WEARABLES=[
 {id:'whoop',label:'WHOOP',note:'Export file free, live sync with Pro'},
 {id:'garmin',label:'Garmin',note:'Live sync'},
 {id:'fitbit',label:'Fitbit',note:'Live sync through Google'},
 {id:'apple',label:'Apple Watch',note:'Import from the iPhone Health app'},
 {id:'other',label:'Something else',note:'Xeyo works without it'},
 {id:'none',label:'None',note:'Meals, weight and journal'}
];
export const STEPS=[{id:'wearables',label:'Your wearables'},{id:'connect',label:'Connect'},{id:'about',label:'About you'},{id:'community',label:'Community'},{id:'insight',label:'First insight'},{id:'pro_offer',label:'Xeyo Pro'}];
const ORDER=STEPS.map(s=>s.id),WEARABLE_IDS=WEARABLES.map(w=>w.id),WHOOP_CHOICES=['import','pro','waitlist'],IMPORTS=['apple','fitbit'];
const AFTER_SAVE=['insight','pro_offer'],MAX_AGE=30*86400000;
const PROVIDER={garmin:'garmin',fitbit:'google_health',whoop:'whoop'};
// OAuth destinations are checked before leaving the page: a tampered or misconfigured reply must not send anyone elsewhere.
export const OAUTH={
 garmin:{action:'garmin-connect',prefix:'https://connect.garmin.com/',provider:'garmin',label:'Garmin'},
 fitbit:{action:'google-health-connect',prefix:'https://accounts.google.com/o/oauth2/v2/auth?',provider:'google_health',label:'Google'},
 whoop:{action:'whoop-connect',prefix:'https://api.prod.whoop.com/oauth/oauth2/auth?',provider:'whoop',label:'WHOOP'}
};

// "connect" stays in the list even for None, so the step count never jumps while someone is choosing. Pro members skip
// the offer. Editing an existing profile is the short flow: just the two profile questions.
export function onboardingSteps({wearables=[],plan={},flow='full'}={}){
 void wearables;
 if(flow==='profile')return ['about','community'];
 return ORDER.filter(id=>id!=='pro_offer'||!plan?.pro);
}
// None is exclusive: choosing it clears the others, choosing anything else clears None. Order follows the list.
export function toggleWearable(list,id){
 if(!WEARABLE_IDS.includes(id))return list;
 const set=new Set(list);
 if(set.has(id))set.delete(id);else if(id==='none'){set.clear();set.add('none')}else{set.delete('none');set.add(id)}
 return WEARABLE_IDS.filter(w=>set.has(w));
}
export function reduceOnboarding(state,action){
 const steps=action.steps||onboardingSteps({wearables:state.wearables,plan:action.plan});
 const at=steps.indexOf(state.step);
 switch(action.type){
  case 'toggle_wearable':return {...state,wearables:toggleWearable(state.wearables,action.id)};
  case 'whoop':return WHOOP_CHOICES.includes(action.choice)||action.choice===null?{...state,whoopChoice:action.choice}:state;
  case 'open_after':{const set=new Set(state.openAfter);if(!IMPORTS.includes(action.id))return state;action.on?set.add(action.id):set.delete(action.id);return {...state,openAfter:IMPORTS.filter(i=>set.has(i))};}
  case 'draft':return {...state,draft:{...state.draft,...action.patch}};
  case 'set':return {...state,...action.patch};
  case 'next':return at>=0&&at<steps.length-1?{...state,step:steps[at+1]}:state;
  case 'back':return at>0?{...state,step:steps[at-1]}:state;
  default:return state;
 }
}

// Progress survives an OAuth round trip or a closed tab. Never the photo file, only the choices.
export const progressKey=userId=>`xeyo-onboarding:${userId}`;
const DRAFT_KEYS=['representation','gender','age','peer_opt_in','photo_record_id'];
function cleanDraft(d={}){
 const out={};
 if(representations.some(r=>r.id===d.representation))out.representation=d.representation;
 if(['woman','man','nonbinary','unspecified'].includes(d.gender))out.gender=d.gender;
 if(d.age!==undefined&&d.age!==null&&/^\d{0,3}$/.test(String(d.age)))out.age=String(d.age);
 if(typeof d.peer_opt_in==='boolean')out.peer_opt_in=d.peer_opt_in;
 if(typeof d.photo_record_id==='string'||d.photo_record_id===null)out.photo_record_id=d.photo_record_id;
 return out;
}
export function readProgress(storage,userId,{now=Date.now()}={}){
 if(!storage||!userId)return null;
 try{
  const raw=JSON.parse(storage.getItem(progressKey(userId))||'null');
  if(!raw||raw.v!==1||!ORDER.includes(raw.step)||!(now-Number(raw.at)<MAX_AGE))return null;
  return {step:raw.step,wearables:(Array.isArray(raw.wearables)?raw.wearables:[]).filter(w=>WEARABLE_IDS.includes(w)),whoopChoice:WHOOP_CHOICES.includes(raw.whoopChoice)?raw.whoopChoice:null,openAfter:(Array.isArray(raw.openAfter)?raw.openAfter:[]).filter(i=>IMPORTS.includes(i)),waitlistPosition:Number.isInteger(raw.waitlistPosition)?raw.waitlistPosition:null,saved:raw.saved===true,draft:cleanDraft(raw.draft)};
 }catch{return null}
}
export function writeProgress(storage,userId,state,{now=Date.now()}={}){
 if(!storage||!userId)return;
 const draft=Object.fromEntries(DRAFT_KEYS.filter(k=>k in state.draft).map(k=>[k,state.draft[k]]));
 try{storage.setItem(progressKey(userId),JSON.stringify({v:1,at:now,step:state.step,wearables:state.wearables,whoopChoice:state.whoopChoice,openAfter:state.openAfter,waitlistPosition:state.waitlistPosition,saved:state.saved,draft}))}catch{/* private mode or full storage: resume is a convenience */}
}
export function clearProgress(storage,userId){try{storage?.removeItem(progressKey(userId))}catch{}}
// A stored step that no longer applies (Pro bought, so no offer) moves forward to the next one that does; the steps
// after the profile save need a saved profile, so without one the member resumes at the community question.
export function resumeStep(step,steps,{hasProfile=false}={}){
 let s=steps.includes(step)?step:steps.find(id=>ORDER.indexOf(id)>=ORDER.indexOf(step))??steps.at(-1);
 if(AFTER_SAVE.includes(s)&&!hasProfile&&steps.includes('community'))s='community';
 return s;
}
// What the member asked to open once setup is done: the WHOOP upload first, then the file imports they ticked.
export const openAfterList=state=>[...(state.whoopChoice==='import'&&state.wearables.includes('whoop')?['whoop']:[]),...state.openAfter.filter(i=>state.wearables.includes(i))];

// The connect screen, as data: one item per chosen wearable, with the state that decides what it says.
export function connectItems({wearables=[],capabilities={},connections=[],seats=null,waitlisted=false,plan={},whoopChoice=null,waitlistPosition=null,openAfter=[]}={}){
 const connected=new Set(connections.map(c=>c?.provider).filter(Boolean));
 const items=[];
 for(const id of wearables){
  if(id==='whoop'){
   const left=seats?Math.max(0,Number(seats.left)||0):null;
   const full=!!seats&&!seats.mine&&left===0;
   items.push({id,status:connected.has('whoop')?'connected':'choose',pro:!!plan?.pro,choice:whoopChoice,seats:seats?{cap:Number(seats.cap)||0,left,mine:!!seats.mine}:null,full,waitlisted:waitlisted||whoopChoice==='waitlist'||waitlistPosition!=null,position:waitlistPosition});
  }else if(id==='garmin')items.push({id,status:connected.has('garmin')?'connected':capabilities.garmin?'available':'off'});
  else if(id==='fitbit')items.push({id,status:connected.has('google_health')?'connected':capabilities.googleHealth?'available':'off',importAfter:openAfter.includes('fitbit')});
  else if(id==='apple')items.push({id,status:'import',importAfter:openAfter.includes('apple')});
 }
 if(wearables.includes('other')||wearables.includes('none'))items.push({id:'none',other:wearables.includes('other'),only:!wearables.some(w=>!['other','none'].includes(w))});
 return items;
}

const pill=(text,on=false)=>`<span class="status-pill${on?' on':''}">${text}</span>`;
const afterToggle=(id,on,text)=>`<label class="after-toggle"><input type="checkbox" data-open-after="${id}" ${on?'checked':''}><span>${text}</span></label>`;
function whoopHTML(item){
 if(item.status==='connected')return `<section class="connect-row" aria-labelledby="connect-whoop"><div class="connect-head"><h2 class="onboard-subhead" id="connect-whoop">WHOOP</h2>${pill('Connected',true)}</div><p>Live sync is on. New WHOOP data arrives on its own.</p></section>`;
 const seats=item.seats,line=seatLine(seats);
 const proCopy=item.pro?'Included in your Pro plan. New WHOOP data arrives on its own every day.':'New WHOOP data arrives on its own every day, with no export to upload.';
 const seatHTML=!seats?'':item.full?`<span class="seat-line is-full"><b>0</b><small>of ${seats.cap} live seats left</small></span>`:seats.mine?`<span class="seat-line"><small>${esc(line)}</small></span>`:`<span class="seat-line"><b>${seats.left}</b><small>of ${seats.cap} live seats left</small></span>`;
 const choice=(value,title,tag,copy,extra='',disabled=false)=>`<label class="choice-card${disabled?' is-disabled':''}"><input type="radio" name="whoop" value="${value}" ${item.choice===value?'checked':''} ${disabled?'disabled':''}><span class="choice-copy"><strong>${title}<small class="tag${value==='pro'?' dark':''}">${tag}</small></strong><span>${copy}</span>${extra}</span><span class="choice-check" aria-hidden="true"></span></label>`;
 let detail='';
 if(item.full)detail=`<div class="whoop-detail whoop-full" role="group" aria-labelledby="whoop-full-title"><h3 id="whoop-full-title">Pro WHOOP seats are full.</h3><p>All ${seats.cap} live WHOOP seats are taken. Join the waitlist to be next in line when one opens. Pro’s other features, the Weekly Health Report, correlations, full history, CSV export and unlimited Ask Xeyo, don’t need a WHOOP seat.</p>${item.waitlisted?`<p class="waitlist-done" role="status">${item.position?`You’re #${item.position} on the waitlist.`:'You’re on the waitlist.'}</p>`:'<button type="button" class="btn light" id="whoop-waitlist">Join the waitlist</button>'}</div>`;
 else if(item.choice==='pro')detail=item.pro?'<div class="whoop-detail"><p>Sign in at WHOOP and approve access. You come straight back here.</p><button type="button" class="btn" id="connect-whoop-live" data-connect="whoop">Connect WHOOP ↗</button></div>':`<div class="whoop-detail"><p>Checkout opens Stripe in this tab. You come straight back here to finish setting up.</p><button type="button" class="btn" id="whoop-checkout">Continue to checkout · ${PRICE}</button></div>`;
 else if(item.choice==='import')detail='<div class="whoop-detail"><p>We’ll open the WHOOP upload when setup is done. It takes the export file as it arrives from WHOOP.</p></div>';
 return `<section class="connect-row" aria-labelledby="connect-whoop"><div class="connect-head"><h2 class="onboard-subhead" id="connect-whoop">WHOOP</h2>${pill({import:'Free import',pro:'Live sync',waitlist:'On the waitlist'}[item.choice]||(item.waitlisted?'On the waitlist':'Choose one'),!!item.choice)}</div><fieldset class="whoop-choice"><legend class="sr-only">How should your WHOOP data come in?</legend>${choice('import','Import your WHOOP export','Free','Request your data export in the WHOOP app. WHOOP emails you a file, and you upload it here: recovery, sleep, strain, workouts and journal answers.')}${choice('pro','Live sync with Pro',item.pro?'Included':PRICE,proCopy,seatHTML,item.full&&!item.pro)}</fieldset>${detail}</section>`;
}
export function connectHTML(items){
 return `<div class="connect-list">${items.map(item=>{
  if(item.id==='whoop')return whoopHTML(item);
  if(item.id==='garmin')return `<section class="connect-row" aria-labelledby="connect-garmin"><div class="connect-head"><h2 class="onboard-subhead" id="connect-garmin">Garmin</h2>${item.status==='connected'?pill('Connected',true):item.status==='off'?pill('Not switched on yet'):pill('Live sync')}</div>${item.status==='connected'?'<p>Connected. Your Garmin data syncs on its own.</p>':item.status==='off'?'<p>Garmin sync isn’t switched on in Xeyo yet. Once it is, you can connect it from Integrations in one step.</p>':'<p>Sign in at Garmin Connect and approve access. You come straight back here to continue.</p><div class="connect-actions"><button type="button" class="btn" id="connect-garmin-btn" data-connect="garmin">Connect Garmin ↗</button></div>'}</section>`;
  if(item.id==='fitbit')return `<section class="connect-row" aria-labelledby="connect-fitbit"><div class="connect-head"><h2 class="onboard-subhead" id="connect-fitbit">Fitbit</h2>${item.status==='connected'?pill('Connected',true):item.status==='off'?pill('Not switched on yet'):pill('Live sync')}</div>${item.status==='connected'?'<p>Connected through your Google account. Your Fitbit data syncs on its own.</p>':item.status==='off'?`<p>Live Fitbit sync isn’t switched on in Xeyo yet. You can import a Fitbit data export file instead.</p>${afterToggle('fitbit',item.importAfter,'Open the Fitbit import when setup is done')}`:'<p>Fitbit data now comes through your Google account. Sign in with Google and approve access. You come straight back here.</p><div class="connect-actions"><button type="button" class="btn" id="connect-fitbit-btn" data-connect="fitbit">Connect Fitbit ↗</button></div>'}</section>`;
  if(item.id==='apple')return `<section class="connect-row" aria-labelledby="connect-apple"><div class="connect-head"><h2 class="onboard-subhead" id="connect-apple">Apple Watch</h2>${pill('File import')}</div><p>Apple Watch data lives in the Health app on your iPhone. Export it there and import the file into Xeyo. Automatic sync is planned for later.</p>${afterToggle('apple',item.importAfter,'Open the Apple Health import when setup is done')}</section>`;
  return `<section class="connect-row quiet" aria-labelledby="connect-none"><div class="connect-head"><h2 class="onboard-subhead" id="connect-none">${item.only?'No wearable needed':'Without a wearable'}</h2></div><p>${item.other?'Xeyo connects WHOOP, Garmin, Fitbit and Apple Health today. ':''}Meals, weight, body measurements and your journal all work without a wearable. You can connect one anytime from Integrations.</p></section>`;
 }).join('')}</div>`;
}
export function insightHTML(insight,{wearables=[],whoopChoice=null,connections=[]}={}){
 if(insight&&(insight.title||insight.text)){
  const m=insight.metric;
  return `<article class="onboard-insight" aria-labelledby="insight-title"><span class="eyebrow">From your own readings</span>${m&&m.value!=null?`<div class="stat"><b>${esc(m.value)}</b>${m.unit?`<small>${esc(m.unit)}</small>`:''}</div>${m.label?`<span class="stat-caption">${esc(m.label)}</span>`:''}`:''}<h2 id="insight-title">${esc(insight.title)}</h2><p>${esc(insight.text)}</p></article>`;
 }
 const live=connections.some(c=>['garmin','google_health','whoop'].includes(c?.provider));
 const next=[];
 if(whoopChoice==='import')next.push('Upload your WHOOP export when setup is done.');
 if(live)next.push('Your connected wearable syncs in the background.');
 if(wearables.includes('apple'))next.push('Import the export from the iPhone Health app.');
 if(!next.length)next.push(wearables.some(w=>!['none','other'].includes(w))?'Connect or import a wearable from Integrations.':'Log a few meals and your weight on Home.');
 return `<article class="onboard-insight is-empty" aria-labelledby="insight-title"><span class="eyebrow">Not enough readings yet</span><h2 id="insight-title">Your first insight needs a few days of your own data.</h2><p>Xeyo compares each day with your usual range, so it waits until there is a range to compare with. Rather than show you a made-up number, this space stays empty until then.</p><ol class="insight-next">${next.map(n=>`<li>${esc(n)}</li>`).join('')}</ol><p class="mini-note">Your first insight then appears on Home.</p></article>`;
}
export function proOfferHTML({seats=null}={}){
 const rows=Object.entries(FEATURES).map(([id,f])=>`<li><b>${esc(f.title)}</b><span>${esc(f.value)}${id==='whoop_live'&&seatLine(seats)?` <em>${esc(seatLine(seats))}.</em>`:''}</span></li>`).join('');
 return `<div class="onboard-pro"><ul class="pro-features">${rows}</ul><aside class="pro-price-tile" aria-label="Price"><span class="eyebrow">Xeyo Pro</span><div class="stat"><b>€5</b><small>/month</small></div><span class="stat-caption">Cancel anytime. Free has no time limit.</span></aside></div>`;
}

// Tracking and progress for one run of the flow. Viewed once per step; completed when the member moves on (an OAuth or
// checkout redirect counts as completed, with how); dropped only when they leave from a step without finishing it.
export function createOnboardingFlow({userId,storage,track=()=>{},plan={pro:false},profile=null,flow,now=()=>Date.now()}={}){
 const stored=readProgress(storage,userId,{now:now()});
 const mode=flow||(stored||!profile?'full':'profile'),full=mode==='full';
 const base={representation:'photo',gender:'',age:'',peer_opt_in:false,photo_record_id:null,...cleanDraft(profile||{})};
 let state={step:null,wearables:[],whoopChoice:null,openAfter:[],waitlistPosition:null,saved:false,draft:base};
 if(full&&stored)state={...state,...stored,draft:{...base,...stored.draft}};
 const steps=()=>onboardingSteps({wearables:state.wearables,plan,flow:mode});
 state.step=resumeStep(state.step||steps()[0],steps(),{hasProfile:!!profile});
 let viewed=null,leaving=false,finished=false;
 const t=(event,props={})=>{if(!full)return;try{track(event,props)}catch{}};
 const persist=()=>{if(full&&!finished)writeProgress(storage,userId,state,{now:now()})};
 const at=()=>({step:state.step,index:steps().indexOf(state.step)+1,of:steps().length});
 return {
  mode,
  get state(){return state},get steps(){return steps()},get finished(){return finished},get leaving(){return leaving},
  dispatch(action){state=reduceOnboarding(state,{...action,steps:steps()});persist();return state},
  view(){if(viewed!==state.step){viewed=state.step;t('onboarding_step_viewed',at());}persist()},
  next(props={}){t('onboarding_step_completed',{...at(),...props});state=reduceOnboarding(state,{type:'next',steps:steps()});persist();return state.step},
  back(){state=reduceOnboarding(state,{type:'back',steps:steps()});persist();return state.step},
  // Leaving the page on purpose (OAuth, Stripe): the step is done, the pagehide that follows is not a drop.
  leave(props={}){t('onboarding_step_completed',{...at(),...props});leaving=true;persist()},
  stay(){leaving=false},
  drop(reason='exit'){if(finished||leaving)return false;t('onboarding_step_dropped',{...at(),reason});return true},
  track:t,
  finish(props={}){if(finished)return false;t('onboarding_step_completed',{...at(),...props});t('onboarding_completed',{steps:steps().length,wearables:state.wearables,whoop_choice:state.whoopChoice||'none'});finished=true;if(full)clearProgress(storage,userId);return true},
  // Signing out or going back to the workspace ends the run without completing it; the draft is not left behind.
  close(){finished=true;clearProgress(storage,userId)}
 };
}

const glowFigure=gender=>gender==='woman'?'/images/glow-woman.webp':'/images/glow-man.webp';
const COPY={
 wearables:['Which wearables do you use?','Choose all that apply. Xeyo reads them side by side, and works without one too.','You can change this later in Integrations.'],
 connect:['Bring your data in.','Only for what you chose. Anything you skip can be connected later from Integrations.','Nothing connects without your say.'],
 about:['A little about you.','This puts your numbers in context. It is never used to assign a health score.','Just a little context.'],
 community:['Your progress, in perspective.','See where your readings sit among people your age. Participation is optional.','Your preferences can be changed anytime.'],
 insight:['Your first insight.','Built only from your own readings, never from an average person.','From your readings only.'],
 pro_offer:['Xeyo Pro, if you want it.','Free stays free: Garmin and Fitbit sync, file imports, your last 30 days and everyday AI with Claude Haiku for meals, questions and your journal. Pro adds:','You can upgrade later from Integrations.']
};

export function openOnboarding({app,profile,photos=[],save,done,signOut,orb,userId,api,capabilities={},connections=[],plan={pro:false},seats=null,waitlisted=false,firstInsight=null,track=()=>{},startCheckout,openWhoopUpload,openImport,savePreferences,storage=globalThis.localStorage,flow,navigate=url=>location.assign(url)}){
 const run=createOnboardingFlow({userId,storage,track,plan,profile,flow});
 let selectedFile=null,busy=false,shownStep=null,savedProfile=null,ended=false;
 const submit=createOnboardingSubmitter({save,done:async saved=>{savedProfile=saved;run.dispatch({type:'set',patch:{saved:true}})}});
 const onHide=()=>{run.drop('pagehide')};
 // Back from OAuth through the browser's back button: the page is restored as it was left, so unlock it.
 const onShow=e=>{if(e.persisted){run.stay();busy=false;render()}};
 addEventListener('pagehide',onHide);addEventListener('pageshow',onShow);
 const cleanup=()=>{ended=true;removeEventListener('pagehide',onHide);removeEventListener('pageshow',onShow)};
 const $=s=>app.querySelector(s);
 const fail=message=>{const box=$('#onboard-error');if(box)box.textContent=message};
 const hasProfile=()=>!!(savedProfile||profile);

 function stepBody(step,s){
  const d=s.draft;
  if(step==='wearables')return `<fieldset class="wearable-options"><legend class="sr-only">Wearables you use</legend>${WEARABLES.map(w=>`<label class="wearable-option"><input type="checkbox" name="wearable" value="${w.id}" ${s.wearables.includes(w.id)?'checked':''}><span class="wearable-copy"><strong>${w.label}</strong><small>${w.note}</small></span><span class="choice-check" aria-hidden="true"></span></label>`).join('')}</fieldset>`;
  if(step==='connect')return connectHTML(connectItems({wearables:s.wearables,capabilities,connections,seats,waitlisted,plan,whoopChoice:s.whoopChoice,waitlistPosition:s.waitlistPosition,openAfter:s.openAfter}));
  if(step==='about')return `<div class="onboard-basics"><fieldset><legend>How do you describe yourself?</legend><div class="gender-options">${[['woman','Woman'],['man','Man'],['nonbinary','Non-binary'],['unspecified','Prefer not to say']].map(([v,t])=>`<label><input type="radio" name="gender" value="${v}" ${d.gender===v?'checked':''} required><span>${t}</span></label>`).join('')}</div><p class="mini-note">Used for your profile, not to assume a body type or assign a health score.</p></fieldset><label class="field age-field">Your age<div><input name="age" type="number" inputmode="numeric" min="18" max="120" step="1" required value="${esc(d.age)}" placeholder="28"><span>years</span></div></label><p class="mini-note age-note">Xeyo is currently for people aged 18 and over. Your age is kept private.</p></div><fieldset class="representation-options"><legend class="onboard-legend">How would you like to see yourself on Home and Body?</legend>${representations.map(r=>`<label class="representation-option"><input type="radio" name="representation" value="${r.id}" ${d.representation===r.id?'checked':''}><span class="representation-art art-${r.id}">${r.id==='stats'?'<i></i><i></i><i></i><i></i>':r.id==='digital'?`<img class="digital-art" src="${digitalFigure(d.gender).src}" alt="" width="256" height="256">`:'<img src="/images/human-portrait.webp" alt="" width="1024" height="1536">'}</span><span class="representation-copy"><strong>${r.title}${r.label?`<small>${r.label}</small>`:''}</strong><span>${r.description}</span></span><span class="choice-check" aria-hidden="true"></span></label>`).join('')}</fieldset><div class="onboard-photo" ${d.representation==='photo'?'':'hidden'}><div><h2 class="onboard-subhead">The reference for your portrait</h2><p>Choose a clear photo of just you. We use it to create your portrait with the original model as the style reference.</p></div><label class="btn light photo-picker">${selectedFile?esc(selectedFile.name):'Choose photo'}<input id="onboard-file" type="file" accept="image/*,.heic,.heif"></label>${selectedFile?'<span class="status-pill on">Ready to upload</span>':''}${photos.length?`<label class="field">Or use a saved photo<select id="saved-photo"><option value="">Choose later</option>${photos.map(p=>`<option value="${esc(p.id)}" ${d.photo_record_id===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>`:''}<p class="mini-note">After saving, open the portrait studio to generate and review your likeness using your own OpenAI key. Your photo stays private; it is not displayed on your dashboard. You can do this later.</p></div>`;
  if(step==='community')return `<div class="peer-intro"><div class="peer-illustration" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div><h2 class="onboard-subhead">A private place in the bigger picture.</h2><p>Compare 30-day averages within your age group, using the same measurement and source. Your name, photo and individual readings are never displayed to other members.</p></div></div><label class="peer-consent"><input type="checkbox" name="peer_opt_in" ${d.peer_opt_in?'checked':''}><span><strong>Include me in anonymous peer comparisons</strong><small>Your readings contribute to group averages and percentiles. Results need at least 20 other participating people and 7 recorded days per person. You can leave anytime in Profile.</small></span></label><p class="mini-note">A percentile describes your position in this Xeyo group. A higher number does not necessarily mean better health. No public profiles or global health scores.</p>`;
  if(step==='insight')return insightHTML(firstInsight,{wearables:s.wearables,whoopChoice:s.whoopChoice,connections});
  if(step==='pro_offer')return proOfferHTML({seats});
  return '';
 }
 function actionsHTML(step,steps){
  const i=steps.indexOf(step),last=i===steps.length-1;
  const back=`<button type="button" class="text-button" id="onboard-back" ${i===0?'hidden':''}>← Back</button>`;
  if(step==='pro_offer')return `${back}<span>${COPY[step][2]}</span><span class="onboard-pair"><button type="button" class="btn light" id="pro-not-now">Not now</button><button type="button" class="btn" id="pro-try">Try Pro · ${PRICE}</button></span>`;
  const label=run.mode==='profile'&&step==='community'?(profile?'Save preferences':'Enter my workspace'):step==='community'?'Save and continue':last?'Enter my workspace':'Continue';
  return `${back}<span>${COPY[step][2]}</span><button class="btn" type="submit">${label} ↗</button>`;
 }
 function render(){
  if(ended)return;
  const s=run.state,step=s.step,steps=run.steps,i=steps.indexOf(step);
  // Re-rendering within a step keeps keyboard focus where it was (e.g. arrowing through radios or ticking boxes).
  const active=document.activeElement,keep=active?.name&&['radio','checkbox'].includes(active.type)?`[name="${active.name}"][value="${CSS.escape(active.value)}"]`:active?.dataset?.openAfter?`[data-open-after="${active.dataset.openAfter}"]`:active?.id?'#'+CSS.escape(active.id):null;
  const labels=Object.fromEntries(STEPS.map(x=>[x.id,x.label]));
  app.innerHTML=`<main class="frame auth-layout onboarding"><header class="auth-top"><span class="auth-brand">${orb()}<span>Xeyo</span></span><button class="btn light small" id="onboard-exit">${hasProfile()?'Back to workspace':'Sign out'}</button></header><div class="auth-grid onboard-grid"><section class="auth-art onboard-glow"><img class="auth-figure" id="onboard-figure" src="${glowFigure(s.draft.gender)}" alt="" width="864" height="1152"><div class="auth-panel"><h2>Make this space yours.</h2><ol class="onboard-progress steps-${steps.length}" aria-label="Step ${i+1} of ${steps.length}">${steps.map((id,n)=>`<li class="${n<i?'done':n===i?'active':''}" ${n===i?'aria-current="step"':''}><b>${String(n+1).padStart(2,'0')}</b><span>${labels[id]}</span></li>`).join('')}</ol></div><span class="auth-caption">Illustrative portrait</span></section><section class="card auth-card onboard-card"><div class="auth-inner"><div class="card-head"><span class="marker" aria-hidden="true"></span><span class="auth-kicker">Step ${i+1} of ${steps.length}</span><span class="onboard-meter" aria-hidden="true"><i style="width:${Math.round((i+1)/steps.length*100)}%"></i></span></div><h1>${COPY[step][0]}</h1><p class="auth-lead">${COPY[step][1]}</p><form id="onboard-form" class="step-${step}" novalidate>${stepBody(step,s)}<div id="onboard-error" role="alert"></div><footer class="onboard-actions">${actionsHTML(step,steps)}</footer></form></div></section></div></main>`;
  wire(step);
  const h1=$('h1');h1.setAttribute('tabindex','-1');
  if(step!==shownStep||!keep||!$(keep)){const first=step!==shownStep;shownStep=step;if(first)run.view();h1.focus({preventScroll:true});window.scrollTo(0,0)}else $(keep).focus({preventScroll:true});
 }
 function capture(){
  const form=$('#onboard-form');if(!form)return;const v=new FormData(form),step=run.state.step;
  if(step==='about')run.dispatch({type:'draft',patch:{gender:v.get('gender')||run.state.draft.gender,age:String(v.get('age')??run.state.draft.age),representation:v.get('representation')||run.state.draft.representation}});
  if(step==='community')run.dispatch({type:'draft',patch:{peer_opt_in:v.has('peer_opt_in')}});
 }
 function lock(on){app.querySelectorAll('#onboard-form button,#onboard-exit').forEach(b=>b.disabled=on)}
 // Tracking and cleanup happen once; done() runs again if a first workspace transition failed and the member retries.
 async function finish(props={},{checkout=false}={}){
  if(run.finish(props))cleanup();
  const s=run.state,openAfter=openAfterList(s);
  await done(savedProfile||profile||undefined,{whoopChoice:s.whoopChoice,openAfter,wearables:s.wearables});
  if(checkout)return;
  // One dialog at a time: the first thing they asked for opens now; the rest stays one click away in Integrations.
  const first=openAfter[0];
  if(first==='whoop')openWhoopUpload?.();else if(first)openImport?.(first);
 }
 async function oauth(id,button){
  const o=OAUTH[id];if(busy||!o)return;busy=true;lock(true);const label=button.textContent;button.textContent=`Opening ${o.label}…`;fail('');
  try{
   const r=await api(o.action);
   if(typeof r?.url!=='string'||!r.url.startsWith(o.prefix))throw Error('Invalid authorization destination.');
   run.leave({via:'oauth',provider:o.provider});
   navigate(r.url);
  }catch(error){
   run.stay();busy=false;lock(false);button.textContent=label;
   fail(error?.code==='seats_full'?'Pro WHOOP seats are full right now. Join the waitlist and keep going.':error?.code==='pro_required'?'Live WHOOP sync is part of Xeyo Pro.':error?.message||'That connection could not start. Try again.');
  }
 }
 async function checkout(source,button,props){
  if(busy||typeof startCheckout!=='function'){if(!startCheckout)fail('Checkout isn’t available right now. You can upgrade later from Integrations.');return;}
  busy=true;lock(true);const label=button.textContent;button.textContent='Opening checkout…';fail('');
  try{run.leave({via:'checkout',...props});await startCheckout(source);}
  catch(error){run.stay();busy=false;lock(false);button.textContent=label;fail(error?.message||'Checkout could not open. Try again.')}
 }
 function wire(step){
  $('#onboard-exit').onclick=async()=>{
   if(busy)return;run.drop('exit');
   if(hasProfile()){run.close();cleanup();await done(savedProfile||undefined,{exited:true,whoopChoice:run.state.whoopChoice,openAfter:[],wearables:run.state.wearables});}
   else{run.close();cleanup();await signOut();}
  };
  const back=$('#onboard-back');if(back)back.onclick=()=>{if(busy)return;capture();run.back();render()};
  app.querySelectorAll('[name=wearable]').forEach(el=>el.onchange=()=>{run.dispatch({type:'toggle_wearable',id:el.value});fail('');render()});
  app.querySelectorAll('[name=whoop]').forEach(el=>el.onchange=()=>{run.dispatch({type:'whoop',choice:el.value});render()});
  app.querySelectorAll('[data-open-after]').forEach(el=>el.onchange=()=>run.dispatch({type:'open_after',id:el.dataset.openAfter,on:el.checked}));
  app.querySelectorAll('[data-connect]').forEach(el=>el.onclick=()=>oauth(el.dataset.connect,el));
  const wc=$('#whoop-checkout');if(wc)wc.onclick=()=>{run.track('pro_offer_accepted',{step:'connect',source:'whoop_live'});checkout('whoop_live',wc,{feature:'whoop_live'})};
  const wl=$('#whoop-waitlist');if(wl)wl.onclick=async()=>{
   if(busy)return;busy=true;wl.disabled=true;wl.textContent='Joining…';fail('');
   try{const r=await api('whoop-waitlist-join');const position=Number.isInteger(r?.position)?r.position:null;run.dispatch({type:'set',patch:{whoopChoice:'waitlist',waitlistPosition:position}});run.track('whoop_waitlist_joined',{step:'connect',position:position??0});busy=false;render();}
   catch(error){busy=false;wl.disabled=false;wl.textContent='Join the waitlist';fail(error?.message||'The waitlist could not be joined. Try again.')}
  };
  app.querySelectorAll('[name=representation]').forEach(el=>el.onchange=()=>{capture();render()});
  app.querySelectorAll('[name=gender]').forEach(el=>el.onchange=()=>{run.dispatch({type:'draft',patch:{gender:el.value}});const art=$('#onboard-figure');if(art)art.src=glowFigure(el.value);const digital=$('.digital-art');if(digital)digital.src=digitalFigure(el.value).src});
  const age=app.querySelector('[name=age]');if(age)age.onchange=()=>run.dispatch({type:'draft',patch:{age:age.value}});
  const peer=app.querySelector('[name=peer_opt_in]');if(peer)peer.onchange=()=>run.dispatch({type:'draft',patch:{peer_opt_in:peer.checked}});
  const file=$('#onboard-file');if(file)file.onchange=()=>{selectedFile=file.files[0]||null;render()};
  const saved=$('#saved-photo');if(saved)saved.onchange=()=>{run.dispatch({type:'draft',patch:{photo_record_id:saved.value||null}});selectedFile=null;render()};
  const notNow=$('#pro-not-now');if(notNow)notNow.onclick=async()=>{if(busy)return;busy=true;lock(true);run.track('pro_offer_skipped',{step:'pro_offer'});try{await finish({choice:'not_now'})}catch(error){busy=false;lock(false);fail(error.message)}};
  const tryPro=$('#pro-try');if(tryPro)tryPro.onclick=async()=>{
   if(busy)return;if(typeof startCheckout!=='function'){fail('Checkout isn’t available right now. You can upgrade later from Integrations.');return;}
   busy=true;lock(true);tryPro.textContent='Opening checkout…';run.track('pro_offer_accepted',{step:'pro_offer',source:'onboarding'});
   try{await finish({via:'checkout'},{checkout:true});await startCheckout('onboarding');}
   catch(error){if(app.querySelector('#onboard-error')){busy=false;lock(false);tryPro.textContent=`Try Pro · ${PRICE}`;fail(error?.message||'Checkout could not open.')}}
  };
  $('#onboard-form').onsubmit=async e=>{
   e.preventDefault();if(busy)return;capture();const s=run.state;fail('');
   try{
    if(s.step==='wearables'){
     if(!s.wearables.length)throw Error('Choose at least one, or None.');
     if(typeof savePreferences==='function')Promise.resolve().then(()=>savePreferences({wearables:s.wearables})).catch(()=>{});
    }
    if(s.step==='about')validateProfile({...s.draft,peer_opt_in:false});
   }catch(error){fail(error.message);(app.querySelector('#onboard-form :invalid')||app.querySelector('#onboard-form input'))?.focus();return;}
   if(s.step==='community'){
    const b=e.target.querySelector('[type=submit]');busy=true;lock(true);b.textContent='Saving your workspace…';
    try{await submit(validateProfile(s.draft),s.draft.representation==='photo'?selectedFile:null);}
    catch(error){
     busy=false;if(!$('#onboard-error'))return;lock(false);b.innerHTML='Try again';fail(error.message);
     if(error.code==='PHOTO_UPLOAD_FAILED'){const skip=document.createElement('button');skip.type='button';skip.className='btn light';skip.textContent='Continue without photo';skip.onclick=()=>{selectedFile=null;$('#onboard-form').requestSubmit()};$('#onboard-error').append(document.createElement('br'),skip);}
     return;
    }
    busy=false;
    if(run.mode==='profile'){busy=true;try{await finish()}catch(error){busy=false;fail(error.message)}return;}
   }
   const steps=run.steps;
   if(steps.indexOf(s.step)===steps.length-1){busy=true;lock(true);try{await finish()}catch(error){busy=false;lock(false);fail(error.message)}return;}
   run.next(s.step==='connect'?{whoop_choice:s.whoopChoice||'none'}:s.step==='wearables'?{wearables:s.wearables}:{});render();
  };
 }
 render();
 return {close(){cleanup();run.close()}};
}
