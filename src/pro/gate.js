import {escapeHTML as esc} from '../domain.js';

// One paywall for every Pro feature. Each feature says, in one line, what it is worth to the member; the caller passes
// illustrative example content that sits behind the veil, so a locked card shows the shape of the feature, never
// someone's real numbers and never the member's own data.
export const PRICE='€5/month';
export const FEATURES={
 whoop_live:{title:'Live WHOOP sync',value:'New recovery, sleep and strain arrive on their own every day, with no export to upload.'},
 weekly_report:{title:'Weekly Health Report',value:'Each week, what changed and what moved it, written from your own readings.'},
 correlations:{title:'Correlations across wearables',value:'See how your late workouts and short nights move your HRV and recovery.'},
 full_history:{title:'Full history',value:'Every reading you have ever synced, with 90-day and 1-year charts instead of the last 30 days.'},
 csv_export:{title:'CSV export',value:'Take every reading into a spreadsheet, one row per measurement.'},
 smart_ai:{title:'A frontier AI model',value:'Your questions, meal photos and journal reflections answered by a frontier AI model, sharper than Free’s everyday AI, with three times the monthly AI allowance.'}
};
const ORDER=['full_history','smart_ai','weekly_report','correlations','whoop_live','csv_export'];
const known=id=>Object.hasOwn(FEATURES,id);
const upgradeButton=(feature,label='Upgrade')=>`<button type="button" class="btn" data-action="upgrade" data-feature="${esc(feature)}">${label}</button>`;

// Locked: the example is blurred, hidden from assistive tech and inert, so a screen reader or a Tab key meets only the
// value line and the button. The preview stays in the flow, so locking and unlocking never moves the page.
export function proGate({feature,preview='',locked=true,compact=false,note=''}={}){
 if(!locked)return preview;
 const f=FEATURES[feature]||{title:'Part of Xeyo Pro',value:'This is part of Xeyo Pro.'};
 return `<div class="pro-gate${compact?' compact':''}" data-feature="${esc(feature)}"><div class="pro-gate-preview" aria-hidden="true" inert>${preview}</div><span class="pro-example" aria-hidden="true">Example</span><div class="pro-gate-veil"><div class="pro-gate-panel"><span class="pro-badge">Xeyo Pro</span><h3 class="pro-gate-title">${esc(f.title)}</h3><p class="pro-gate-value">${esc(f.value)}</p>${note?`<p class="pro-gate-note">${esc(note)}</p>`:''}<div class="pro-gate-actions">${upgradeButton(feature)}<span class="pro-gate-price">${PRICE} · cancel anytime</span></div><span class="sr-only">The blurred content behind this message is an example, not your data.</span></div></div></div>`;
}

// The edge function answers a locked request with 402 {code:'pro_required',feature} or {code:'quota',feature,used,quota}.
export function lockedFrom(error){
 if(!error||!['pro_required','quota'].includes(error.code))return null;
 if(error.code==='quota'&&error.pro)return null;
 if(known(error.feature))return error.feature;
 return error.code==='quota'?'smart_ai':null;
}
// The one line under a quota gate: what was used, in plain numbers.
export function quotaNote(error){
 if(error?.code!=='quota')return '';
 const day=resetDay(error.resets);
 return `You have used this month’s free AI.${day?` It resets on ${day}.`:''}`;
}
const resetDay=iso=>{const t=Date.parse(iso||'');return Number.isFinite(t)?new Date(t).toLocaleDateString('en-GB',{day:'numeric',month:'long',timeZone:'UTC'}):''};
const shortDay=iso=>{const t=Date.parse(iso||'');return Number.isFinite(t)?new Date(t).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):''};
export function seatLine(seats){
 if(!seats||!Number.isFinite(Number(seats.cap)))return '';
 if(seats.mine)return 'Your live WHOOP seat is reserved.';
 const left=Math.max(0,Number(seats.left)||0);
 return left?`${left} of ${Number(seats.cap)} live seats left`:'Pro WHOOP seats are full';
}

// Modal body (the caller's showModal adds the frame and the close button). The checkout button carries the feature, so
// the lead can tell which wall the member came from.
export function upgradeDialog({feature,seats=null,plan={pro:false}}={}){
 const f=known(feature)?FEATURES[feature]:null;
 const seatsFull=seats&&!seats.mine&&Number(seats.left)<=0;
 const rows=ORDER.map(id=>`<li${id===feature?' class="is-focus"':''}><b>${esc(FEATURES[id].title)}</b><span>${esc(FEATURES[id].value)}${id==='whoop_live'&&seatLine(seats)?` <em class="pro-seat-note">${esc(seatLine(seats))}.</em>`:''}</span></li>`).join('');
 if(plan?.pro)return `<div class="dialog-kicker"><span class="marker" aria-hidden="true"></span>Xeyo Pro</div><h2 id="dialog-title">You already have Xeyo Pro.</h2><p>${f?`${esc(f.title)} is included in your plan.`:'Everything below is included in your plan.'}${feature==='whoop_live'&&seatsFull?' Live WHOOP seats are full right now; join the waitlist and we will connect you when one opens.':''}</p><ul class="pro-features">${rows}</ul><div class="dialog-footer pro-dialog-footer"><button type="button" class="btn light" data-action="close">Close</button>${feature==='whoop_live'&&seatsFull?'<button type="button" class="btn" data-action="whoop-waitlist">Join the waitlist</button>':'<button type="button" class="btn light" data-action="billing-portal">Manage billing</button>'}</div>`;
 return `<div class="dialog-kicker"><span class="marker" aria-hidden="true"></span>Xeyo Pro</div><h2 id="dialog-title">${f?esc(f.title)+' is part of Xeyo Pro.':'More from the data you already have.'}</h2><p>${f?'Tap a tile to see what else Pro adds.':'Free keeps your last 30 days and every manual entry. Tap a tile to see what Pro adds.'}</p>${proShowcase({seats,focus:feature})}${feature==='whoop_live'&&seatsFull?'<p class="pro-dialog-note">Live WHOOP seats are full. You can still buy Pro for everything else, and join the waitlist for a seat.</p>':''}<div class="dialog-footer pro-dialog-footer"><button type="button" class="btn light" data-action="close">Not now</button><span class="pro-dialog-actions">${feature==='whoop_live'&&seatsFull?'<button type="button" class="btn light" data-action="whoop-waitlist">Join the waitlist</button>':''}<button type="button" class="btn" data-action="checkout" data-feature="${esc(known(feature)?feature:'')}">Upgrade · ${PRICE}</button></span></div>`;
}

// The visible offer: a card (not a pill) where a Free member meets a limit, e.g. under a metric's chart or in the
// refresh panel. It shows, from the member's own account, what Free is holding back right now: how many of their
// readings sit beyond the 30-day window (counts only, never values), drawn as a timeline, and how much of this month's
// free AI they have used. Then four things Pro adds, as tiles, and one orange button that opens checkout.
const ICONS={
 full_history:'<path d="M4 19V9M9 19V5M14 19v-7M19 19V8"/>',
 smart_ai:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>',
 weekly_report:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/>',
 correlations:'<circle cx="6" cy="17" r="1.6"/><circle cx="10" cy="13" r="1.6"/><circle cx="14" cy="12" r="1.6"/><circle cx="18" cy="7" r="1.6"/><path d="M4 20L20 4" stroke-dasharray="2 3"/>',
 whoop_live:'<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M4 4v4h4M20 20v-4h-4"/>',
 csv_export:'<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M4 14h16M10 5v14"/>'
};
const TILES={
 full_history:['1 year+','of charts, not 30 days'],
 smart_ai:['Frontier AI','sharper answers, 3× the allowance'],
 weekly_report:['Weekly','report on what changed and why'],
 correlations:['Patterns','what moves your HRV and recovery'],
 whoop_live:['Live','WHOOP sync, no more uploads'],
 csv_export:['CSV','every reading in a spreadsheet']
};
const icon=id=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[id]||ICONS.full_history}</svg>`;
// Timeline of the member's history: the last 30 days lit (what Free shows), everything before hatched (kept for Pro).
export function historyStrip(hidden,now=Date.now()){
 const since=Date.parse(hidden?.since||''),count=Number(hidden?.readings)||0;
 const span=count&&Number.isFinite(since)?Math.max(60,Math.ceil((now-since)/86400000)):365,free=Math.max(4,Math.round(30/span*100));
 const left=count&&Number.isFinite(since)?`Since ${shortDay(hidden.since)}`:'A year with Pro';
 return `<div class="pro-history" aria-hidden="true"><div class="pro-history-bar"><span class="pro-history-locked" style="flex-basis:${100-free}%"><em>${count?'Kept for Pro':'Pro'}</em></span><span class="pro-history-free" style="flex-basis:${free}%"><em>Free</em></span></div><div class="pro-history-scale"><span>${esc(left)}</span><span>30 days ago</span><span>Today</span></div></div>`;
}
function aiMeter(ai){
 if(!ai||ai.tier!=='free'||!Number.isFinite(Number(ai.percent)))return '';
 const pct=Math.max(0,Math.min(100,Math.round(Number(ai.percent))));
 return `<div class="pro-ai"><div class="pro-ai-row"><span>Free AI this month</span><b>${pct}% used</b></div><div class="pro-ai-bar" role="img" aria-label="${pct}% of this month’s free AI used"><span style="width:${pct}%"></span></div><p>Pro switches you to a frontier AI model with three times the allowance.</p></div>`;
}
export function proCard({feature='',title,body,points,status=null,now=Date.now()}={}){
 const f=FEATURES[feature],hidden=status?.hidden,count=Number(hidden?.readings)||0;
 const ids=(points||[feature,'full_history','smart_ai','weekly_report','whoop_live']).filter((id,i,a)=>TILES[id]&&a.indexOf(id)===i).slice(0,4);
 const insight=count?`<p class="pro-insight"><b>${count.toLocaleString('en-GB')}</b> of your readings from before the last 30 days are saved and waiting. Pro shows them again.</p>`:'';
 const tiles=ids.map(id=>`<li class="pro-tile${id===feature?' is-focus':''}">${icon(id)}<b>${esc(TILES[id][0])}</b><span>${esc(TILES[id][1])}</span></li>`).join('');
 return `<section class="pro-card pro-live" data-feature="${esc(feature)}" aria-label="Xeyo Pro">${proFluid()}<div class="pro-card-copy"><span class="pro-badge">Xeyo Pro</span><h3 class="pro-card-title">${esc(title||f?.title||'Get more from your data')}</h3><p class="pro-card-body">${esc(body||f?.value||'')}</p>${insight}</div>${historyStrip(hidden,now)}<ul class="pro-tiles">${tiles}</ul>${aiMeter(status?.usage?.ai)}<div class="pro-card-cta"><button type="button" class="btn pro-card-button" data-action="upgrade" data-feature="${esc(feature)}">Upgrade to Pro · ${PRICE}</button><span class="pro-gate-price">Cancel anytime. Your data stays yours.</span></div></section>`;
}

// The liquid glass shared by every Pro surface: four soft orange clouds drifting under a glass rim, plus a light that
// follows the pointer. Pure decoration (aria-hidden); CSS stops the drift under reduced motion.
export const proFluid=()=>'<span class="pro-fluid" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
export const proIcon=icon;
const PICKS=['full_history','smart_ai','weekly_report','correlations','whoop_live','csv_export'];
const detailHTML=(id,seats)=>{const f=FEATURES[id],seat=id==='whoop_live'&&seatLine(seats)?` <em>${esc(seatLine(seats))}.</em>`:'';return `${icon(id)}<span class="pro-detail-copy"><b>${esc(f.title)}</b><span>${esc(f.value)}${seat}</span></span>`};
// What Pro adds, as six tiles under one orange glass card. The glass shows the price and, in full, the tile that is
// picked; tiles cycle on their own until the member touches one (enhancePro below).
export function proShowcase({seats=null,focus=''}={}){
 const first=PICKS.includes(focus)?focus:PICKS[0];
 const picks=PICKS.map(id=>`<li><button type="button" class="pro-pick" data-pro-pick="${id}" data-title="${esc(FEATURES[id].title)}" data-value="${esc(FEATURES[id].value)}${id==='whoop_live'&&seatLine(seats)?` ${esc(seatLine(seats))}.`:''}" aria-pressed="${id===first}">${icon(id)}<b>${esc(TILES[id][0])}</b><span>${esc(TILES[id][1])}</span></button></li>`).join('');
 return `<div class="pro-showcase"><section class="pro-glass pro-live" aria-label="Xeyo Pro, €5 a month">${proFluid()}<div class="pro-glass-top"><span class="pro-badge">Xeyo Pro</span><span class="pro-glass-note">Cancel anytime</span></div><div class="pro-glass-price"><b>€5</b><small>/month</small></div><div class="pro-detail" aria-live="off">${detailHTML(first,seats)}</div></section><ul class="pro-picks" aria-label="What Pro adds">${picks}</ul></div>`;
}
// One set of document listeners for every Pro surface, installed once: tile picks, the pointer light, the slow cycle.
let enhanced=false;
export function enhancePro(doc=globalThis.document){
 if(enhanced||!doc?.addEventListener)return;enhanced=true;
 const show=(button,user)=>{
  const box=button.closest('.pro-showcase'),detail=box?.querySelector('.pro-detail');if(!detail)return;
  box.querySelectorAll('[data-pro-pick]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  if(user){box.dataset.touched='1';detail.setAttribute('aria-live','polite')}
  detail.innerHTML=`${icon(button.dataset.proPick)}<span class="pro-detail-copy"><b>${esc(button.dataset.title)}</b><span>${esc(button.dataset.value)}</span></span>`;
  detail.classList.remove('is-new');void detail.offsetWidth;detail.classList.add('is-new');
 };
 doc.addEventListener('click',e=>{const b=e.target.closest?.('[data-pro-pick]');if(b)show(b,true)});
 doc.addEventListener('pointermove',e=>{const el=e.target.closest?.('.pro-live');if(!el)return;const r=el.getBoundingClientRect();el.style.setProperty('--px',`${Math.round(e.clientX-r.left)}px`);el.style.setProperty('--py',`${Math.round(e.clientY-r.top)}px`)},{passive:true});
 const still=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
 setInterval(()=>{
  if(doc.hidden||still?.matches)return;
  doc.querySelectorAll('.pro-showcase:not([data-touched])').forEach(box=>{
   if(box.matches(':hover,:focus-within'))return;
   const all=[...box.querySelectorAll('[data-pro-pick]')],at=all.findIndex(b=>b.getAttribute('aria-pressed')==='true');
   if(all.length)show(all[(at+1)%all.length],false);
  });
 },5000);
}
export {upgradeButton};
