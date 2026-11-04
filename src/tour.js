// The first-run tour of Home: six stops, one spotlight that glides from stop to stop, and the words on a soft grained
// backdrop beside each stop. It runs once after onboarding (and again from the account menu), never blocks anything
// it cannot find, and returns how it ended: 'done' or 'skipped'.

export const TOUR_STEPS=[
 {id:'signals',targets:['.home-grid > .tile','.home-grid > .start-card'],title:'Your signals, at a glance.',text:'The ones you picked, each with its last two weeks. Tap any tile for the full chart and what it means.'},
 {id:'edit',targets:['.home-edit'],title:'Make Home yours.',text:'Swap, add or reorder signals whenever your focus changes.'},
 {id:'ask',targets:['#ask-form'],title:'Ask about any number.',text:'Plain questions, answered from your own readings. Try “Why was my recovery lower today?”'},
 {id:'week',targets:['.week-card'],title:'Your week in one view.',text:'Seven days side by side, today highlighted, and how this week compares with the last. Check in your mood from here too.'},
 {id:'meals',targets:['.calories-card'],title:'Log what you eat.',text:'Describe a meal or snap a photo. Xeyo estimates calories and macros in seconds.'},
 {id:'sync',targets:['#sync-control'],title:'Fresh data, one tap.',text:'Refresh pulls in what your wearables recorded. New sources and file uploads live in Integrations.'}
];

// Where the words go: below the stop if they fit, else above, beside, or (on a small screen, or when the stop fills
// the view) pinned to the edge of the screen the stop is not using. Pure, so it is tested on its own.
export function placeTip(r,view,size,{gap=18,margin=12}={}){
 const {w,h}=view,{bw,bh}=size,clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 const cx=clamp(r.left+r.width/2-bw/2,margin,w-bw-margin),cy=clamp(r.top+r.height/2-bh/2,margin,h-bh-margin);
 if(r.bottom+gap+bh<=h-margin&&r.bottom>=0)return {x:cx,y:r.bottom+gap,side:'below'};
 if(r.top-gap-bh>=margin&&r.top<=h)return {x:cx,y:r.top-gap-bh,side:'above'};
 if(r.right+gap+bw<=w-margin)return {x:r.right+gap,y:cy,side:'right'};
 if(r.left-gap-bw>=margin)return {x:r.left-gap-bw,y:cy,side:'left'};
 const lowerHalfFree=r.top+r.height/2<h/2;
 return {x:clamp((w-bw)/2,margin,w-bw-margin),y:lowerHalfFree?h-bh-margin:margin,side:'overlay'};
}
// One rectangle around every element of a stop (the signal tiles are several cards read as one area).
export function unionRect(rects){
 const list=rects.filter(r=>r&&r.width>0&&r.height>0);if(!list.length)return null;
 const left=Math.min(...list.map(r=>r.left)),top=Math.min(...list.map(r=>r.top)),right=Math.max(...list.map(r=>r.right)),bottom=Math.max(...list.map(r=>r.bottom));
 return {left,top,right,bottom,width:right-left,height:bottom-top};
}

// Irregular, never a circle or a rectangle: each stop gets a slightly different outline, so the ground feels poured.
const SHAPES=['38% 46% 42% 40% / 44% 40% 46% 38%','46% 38% 40% 44% / 40% 46% 38% 44%','40% 42% 46% 36% / 46% 38% 44% 40%','42% 40% 36% 46% / 38% 44% 40% 46%'];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

export function startTour({steps=TOUR_STEPS,doc=globalThis.document,win=globalThis.window,track=()=>{}}={}){
 return new Promise(resolve=>{
  const found=s=>{for(const sel of s.targets){const els=[...doc.querySelectorAll(sel)].filter(el=>el.getClientRects().length);if(els.length)return fit(els)}return null};
  // A stop made of several cards lights as many as leave room for the words (on a phone the tiles stack up).
  const fit=list=>{if(list.length<2)return list;const max=win.innerHeight-(win.innerWidth<600?380:300),out=[list[0]];for(const el of list.slice(1)){const r=unionRect([...out,el].map(x=>x.getBoundingClientRect()));if(r&&r.height>max)break;out.push(el)}return out};
  const live=steps.filter(found);
  if(!live.length){resolve('skipped');return}
  const still=win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const before=doc.activeElement;
  const shield=doc.createElement('div');shield.className='tour-shield';
  const hole=doc.createElement('div');hole.className='tour-hole';hole.setAttribute('aria-hidden','true');
  const tip=doc.createElement('div');tip.className='tour-tip is-moving';tip.setAttribute('role','dialog');tip.setAttribute('aria-modal','true');tip.setAttribute('aria-labelledby','tour-title');tip.setAttribute('aria-describedby','tour-text');
  doc.body.append(shield,hole,tip);doc.documentElement.classList.add('is-touring');
  let i=0,els=[],frame=0,ended=false,timer=0,watch=0;

  const measure=()=>{
   // Home redraws itself when fresh data arrives: find the stop again instead of measuring cards that are gone.
   if(!els.length||els.some(el=>!el.isConnected))els=found(live[i])||[];
   const r=unionRect(els.map(el=>el.getBoundingClientRect()));if(!r)return;
   const pad=10,radius=Math.min(28,parseFloat(win.getComputedStyle(els[0]).borderTopLeftRadius)||16)+(els.length>1?6:pad/2);
   const pill=els.length===1&&r.height<=56;
   Object.assign(hole.style,{left:`${r.left-pad}px`,top:`${r.top-pad}px`,width:`${r.width+pad*2}px`,height:`${r.height+pad*2}px`,borderRadius:pill?'999px':`${radius}px`});
   const view={w:win.innerWidth,h:win.innerHeight},size={bw:tip.offsetWidth,bh:tip.offsetHeight};
   const p=placeTip({left:r.left-pad,top:r.top-pad,right:r.right+pad,bottom:r.bottom+pad,width:r.width+pad*2,height:r.height+pad*2},view,size);
   tip.style.transform=`translate(${Math.round(p.x)}px,${Math.round(p.y)}px)`;tip.dataset.side=p.side;
  };
  const onMove=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure)};
  const bringIntoView=()=>{
   const r=unionRect(els.map(el=>el.getBoundingClientRect()));if(!r)return 0;
   const h=win.innerHeight,room=Math.max(tip.offsetHeight,240)+48;
   // Leave room for the words: the stop sits a little above the middle, or at the top when it is taller than the view.
   const fits=r.top>=72&&r.bottom<=h-room;if(fits)return 0;
   const target=r.height>h-room-90?r.top-80:r.top-(h-room-r.height)/2;
   win.scrollTo({top:Math.max(0,win.scrollY+target),behavior:still?'auto':'smooth'});return still?0:420;
  };
  const html=s=>{const n=live.length,at=live.indexOf(s),last=at===n-1;return `<div class="tour-ground" aria-hidden="true"></div><div class="tour-copy"><div class="tour-meta"><span class="tour-count">${at+1} of ${n}</span><span class="tour-bars" aria-hidden="true">${live.map((_,k)=>`<i class="${k<at?'done':k===at?'on':''}"></i>`).join('')}</span>${last?'':'<button type="button" class="tour-skip" data-tour="skip">Skip</button>'}</div><h2 id="tour-title">${esc(s.title)}</h2><p id="tour-text">${esc(s.text)}</p><div class="tour-actions">${at?'<button type="button" class="tour-back" data-tour="back">← Back</button>':'<span></span>'}<button type="button" class="tour-next" data-tour="next">${last?'Start exploring':'Next'}<span aria-hidden="true"> →</span></button></div></div>`};
  const show=k=>{
   i=k;const s=live[i];els=found(s)||[];
   if(!els.length){k<live.length-1?show(k+1):end('done');return}
   tip.classList.add('is-moving');clearTimeout(timer);
   const wait=bringIntoView();
   timer=setTimeout(()=>{
    tip.innerHTML=html(s);tip.style.setProperty('--tour-shape',SHAPES[i%SHAPES.length]);measure();
    requestAnimationFrame(()=>{tip.classList.remove('is-moving');tip.querySelector('.tour-next')?.focus({preventScroll:true})});
    try{track('tour_step',{step:s.id,index:i+1,of:live.length})}catch{}
   },wait+(still?0:120));
  };
  const end=how=>{
   if(ended)return;ended=true;clearTimeout(timer);cancelAnimationFrame(frame);clearInterval(watch);
   win.removeEventListener('resize',onMove);win.removeEventListener('scroll',onMove,true);doc.removeEventListener('keydown',onKey,true);
   try{track(how==='done'?'tour_completed':'tour_skipped',{index:i+1,of:live.length})}catch{}
   tip.classList.add('is-moving');hole.classList.add('is-leaving');shield.classList.add('is-leaving');
   setTimeout(()=>{shield.remove();hole.remove();tip.remove();doc.documentElement.classList.remove('is-touring');if(before&&doc.contains(before))before.focus?.({preventScroll:true});resolve(how)},still?0:260);
  };
  const go=d=>{const k=i+d;if(k<0)return;k>=live.length?end('done'):show(k)};
  function onKey(e){
   if(e.key==='Escape'){e.preventDefault();end('skipped');return}
   if(e.key==='ArrowRight'){e.preventDefault();go(1);return}
   if(e.key==='ArrowLeft'){e.preventDefault();go(-1);return}
   if(e.key==='Tab'){const b=[...tip.querySelectorAll('button')];if(!b.length)return;const at=b.indexOf(doc.activeElement);e.preventDefault();b[(at+(e.shiftKey?-1:1)+b.length)%b.length].focus()}
  }
  tip.addEventListener('click',e=>{const a=e.target.closest('[data-tour]')?.dataset.tour;if(a==='next')go(1);else if(a==='back')go(-1);else if(a==='skip')end('skipped')});
  win.addEventListener('resize',onMove);win.addEventListener('scroll',onMove,true);doc.addEventListener('keydown',onKey,true);
  // A light check twice a second keeps the spotlight on its stop through redraws and late-loading cards.
  watch=setInterval(()=>{if(!tip.classList.contains('is-moving'))measure()},500);
  show(0);
 });
}
