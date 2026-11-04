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
 ask_unlimited:{title:'Unlimited Ask Xeyo',value:'Ask about your data as often as you like, instead of 3 questions a month.'}
};
const ORDER=['whoop_live','weekly_report','correlations','full_history','csv_export','ask_unlimited'];
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
 if(known(error.feature))return error.feature;
 return error.code==='quota'?'ask_unlimited':null;
}
// The one line under a quota gate: what was used, in plain numbers.
export function quotaNote(error){
 if(error?.code!=='quota')return '';
 const used=Number(error.used),quota=Number(error.quota);
 return Number.isFinite(used)&&Number.isFinite(quota)?`You have used ${used} of your ${quota} free questions this month.`:'You have used this month’s free questions.';
}
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
 return `<div class="dialog-kicker"><span class="marker" aria-hidden="true"></span>Xeyo Pro</div><h2 id="dialog-title">${f?esc(f.title)+' is part of Xeyo Pro.':'More from the data you already have.'}</h2>${f?`<p>${esc(f.value)}</p>`:'<p>Free keeps your last 30 days and every manual entry. Pro adds:</p>'}<ul class="pro-features">${rows}</ul>${feature==='whoop_live'&&seatsFull?'<p class="pro-dialog-note">Live WHOOP seats are full. You can still buy Pro for everything else, and join the waitlist for a seat.</p>':''}<div class="pro-price"><span class="stat"><b>€5</b><small>/month</small></span><span class="stat-caption">Cancel anytime.</span></div><div class="dialog-footer pro-dialog-footer"><button type="button" class="btn light" data-action="close">Not now</button><span class="pro-dialog-actions">${feature==='whoop_live'&&seatsFull?'<button type="button" class="btn light" data-action="whoop-waitlist">Join the waitlist</button>':''}<button type="button" class="btn" data-action="checkout" data-feature="${esc(known(feature)?feature:'')}">Upgrade · ${PRICE}</button></span></div>`;
}
export {upgradeButton};
