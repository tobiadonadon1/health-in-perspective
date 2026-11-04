// The welcome film: six short chapters shown once after onboarding (and from the account menu). Each chapter is its
// own colour field with a small animated scene built from the member's own numbers where they exist, so it reads as
// a designed introduction, not a dimmed screenshot. Resolves 'done' or 'skipped'.

export const TOUR_CHAPTERS=[
 {id:'signals',eyebrow:'Your signals',title:'Everything you chose, at a glance.',text:'Each tile shows today’s number and its last two weeks. Tap one for the full story.'},
 {id:'edit',eyebrow:'Edit Home',title:'Home changes when you do.',text:'Swap, add or reorder signals whenever your focus moves.'},
 {id:'ask',eyebrow:'Ask Xeyo',title:'Ask anything about your numbers.',text:'Plain questions, answered from your own readings in seconds.'},
 {id:'week',eyebrow:'Your week',title:'Seven days, side by side.',text:'Today highlighted, last week for comparison, and your mood check-in in the same place.'},
 {id:'meals',eyebrow:'Meals',title:'Describe a meal. We do the maths.',text:'Type it or snap it. Calories and macros arrive in seconds.'},
 {id:'sources',eyebrow:'Your sources',title:'Every wearable, in one place.',text:'Refresh pulls in what they recorded. Add more anytime in Integrations.'}
];

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

// A smooth line through the values, drawn into a w×h box (pathLength 1, so CSS can draw it in).
export function sparkPath(values,{w=160,h=44,pad=4}={}){
 const v=values.filter(Number.isFinite);if(v.length<2)return '';
 const lo=Math.min(...v),hi=Math.max(...v),span=hi-lo||1;
 const pts=v.map((n,i)=>[pad+i*(w-pad*2)/(v.length-1),h-pad-(n-lo)/span*(h-pad*2)]);
 return pts.map(([x,y],i)=>{if(!i)return `M${x.toFixed(1)} ${y.toFixed(1)}`;const [px,py]=pts[i-1],mx=(px+x)/2;return `C${mx.toFixed(1)} ${py.toFixed(1)} ${mx.toFixed(1)} ${y.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`}).join(' ');
}

// What the scenes show when the member has no readings yet: clearly marked examples, never presented as theirs.
const EXAMPLE={
 signals:[{name:'Recovery',value:'78',unit:'%',series:[62,66,71,58,64,70,74,69,72,77,73,80,75,78]},{name:'HRV',value:'61',unit:'ms',series:[54,58,55,60,57,62,59,63,58,61,64,60,62,61]},{name:'Sleep',value:'7.6',unit:'h',series:[6.8,7.2,7.5,6.4,7.9,7.1,7.4,8.1,6.9,7.7,7.3,7.8,7.0,7.6]}],
 week:{label:'Recovery',unit:'%',days:[['Thu',64],['Fri',71],['Sat',58],['Sun',76],['Mon',81],['Tue',73],['Wed',78]]}
};
const scene={
 signals:c=>{const list=(c.signals?.length?c.signals:EXAMPLE.signals).slice(0,3);return `<div class="w-signals">${list.map((s,i)=>`<div class="w-tile" style="--i:${i}"><span class="w-tile-name">${esc(s.name)}</span><b class="w-tile-num">${esc(s.value)}<small>${esc(s.unit)}</small></b><svg viewBox="0 0 160 44" aria-hidden="true"><path d="${sparkPath(s.series||[])}" pathLength="1"/></svg><span class="w-tile-foot">Last 14 days</span></div>`).join('')}</div>${c.signals?.length?'':'<span class="w-example">Example</span>'}`},
 edit:c=>{const names=[...(c.focus||[]),'Recovery','HRV','Resting heart rate','Sleep','Strain','Heart rate'].filter((n,i,a)=>a.indexOf(n)===i).slice(0,6);return `<div class="w-grid">${names.map((n,i)=>`<span class="w-cell w-cell-${i}"><i></i>${esc(n)}</span>`).join('')}</div><span class="w-edit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/></svg>Edit Home</span>`},
 ask:()=>`<div class="w-chat"><p class="w-q"><span>Why was my recovery lower today?</span></p><div class="w-a"><span class="w-a-head"><i></i>Xeyo <em>· example answer</em></span><p>Your HRV was <b>12% below</b> your 30-day average after a late, hard session. Your resting heart rate stayed steady, so this looks like short-term load, not illness.</p></div></div>`,
 week:c=>{const w=c.week?.days?.length?c.week:EXAMPLE.week,max=Math.max(...w.days.map(d=>d[1]),1);return `<div class="w-week"><span class="w-week-label">${esc(w.label)}${w.unit?` · ${esc(w.unit)}`:''}</span><ol>${w.days.map(([d,v],i)=>`<li class="${i===w.days.length-1?'is-today':''}" style="--h:${Math.max(.12,v/max).toFixed(3)};--i:${i}"><b>${esc(typeof v==='number'?(Math.round(v*10)/10).toLocaleString('en-GB'):v)}</b><span class="w-bar"></span><small>${esc(d)}</small></li>`).join('')}</ol></div>${c.week?.days?.length?'':'<span class="w-example">Example</span>'}`},
 meals:()=>`<div class="w-meal"><p class="w-meal-input"><span>Salmon, rice and greens</span></p><div class="w-macros">${[['Protein','38 g',.72],['Carbs','54 g',.58],['Fat','19 g',.41]].map(([n,g,p],i)=>`<div class="w-ring" style="--p:${p};--i:${i}"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" pathLength="1"/><circle class="w-ring-fill" cx="32" cy="32" r="26" pathLength="1"/></svg><b>${g}</b><small>${n}</small></div>`).join('')}</div><p class="w-kcal"><b>560</b> kcal · estimated · example</p></div>`,
 sources:c=>{const all=['WHOOP','Garmin','Fitbit','Apple Health'],on=new Set(c.connected||[]);return `<div class="w-orbit"><svg class="w-orbit-ring" viewBox="0 0 400 400" aria-hidden="true"><circle cx="200" cy="200" r="150" pathLength="1"/><circle cx="200" cy="200" r="96" pathLength="1"/></svg><img class="w-orb" src="/images/xeyo-orb.webp" alt="" width="132" height="132">${all.map((n,i)=>`<span class="w-source w-source-${i}${on.has(n)?' is-on':''}"><i></i>${esc(n)}</span>`).join('')}${all.map((_,i)=>`<span class="w-pulse w-pulse-${i}" aria-hidden="true"></span>`).join('')}</div>`}
};

export function startTour({ctx={},chapters=TOUR_CHAPTERS,doc=globalThis.document,win=globalThis.window,track=()=>{}}={}){
 return new Promise(resolve=>{
  const still=win.matchMedia?.('(prefers-reduced-motion: reduce)').matches,before=doc.activeElement,n=chapters.length;
  const root=doc.createElement('div');root.className='welcome';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','welcome-title');
  root.innerHTML=`<div class="welcome-grain" aria-hidden="true"></div><header class="welcome-top"><span class="welcome-brand"><img src="/images/xeyo-orb.webp" alt="" width="28" height="28">${ctx.name?`Welcome, ${esc(ctx.name)}`:'Welcome to Xeyo'}</span><button type="button" class="welcome-skip" data-w="skip">Skip</button></header><div class="welcome-body"><section class="welcome-copy" aria-live="polite"></section><div class="welcome-stage" aria-hidden="true"></div></div><footer class="welcome-foot"><nav class="welcome-steps" aria-label="Chapters">${chapters.map((c,k)=>`<button type="button" data-w="go" data-k="${k}" aria-label="${k+1}. ${esc(c.eyebrow)}"><i></i></button>`).join('')}</nav><span class="welcome-nav"><button type="button" class="welcome-back" data-w="back">Back</button><button type="button" class="welcome-next" data-w="next">Next</button></span></footer>`;
  doc.body.append(root);doc.documentElement.classList.add('is-welcoming');
  const $=s=>root.querySelector(s);
  let i=-1,ended=false;
  const fit=()=>{const st=$('.welcome-stage');if(!st)return;const r=st.getBoundingClientRect();st.style.setProperty('--s',String(Math.max(.4,Math.min(1.1,r.width*.94/520,r.height*.9/440))))};
  const show=k=>{
   if(k<0||k>=n||k===i)return;i=k;const c=chapters[i];
   root.dataset.chapter=c.id;
   $('.welcome-copy').innerHTML=`<span class="welcome-eyebrow">${String(i+1).padStart(2,'0')} · ${esc(c.eyebrow)}</span><h2 id="welcome-title">${esc(c.title)}</h2><p>${esc(c.text)}</p>`;
   $('.welcome-stage').innerHTML=`<div class="w-scene" data-scene="${c.id}">${scene[c.id](ctx)}</div>`;fit();
   root.querySelectorAll('.welcome-steps button').forEach((b,m)=>{b.classList.toggle('done',m<i);b.classList.toggle('on',m===i);b.toggleAttribute('aria-current',m===i)});
   $('.welcome-back').hidden=i===0;$('.welcome-next').textContent=i===n-1?'Start exploring':'Next';
   $('.welcome-next').focus({preventScroll:true});
   try{track('tour_step',{step:c.id,index:i+1,of:n})}catch{}
  };
  const end=how=>{
   if(ended)return;ended=true;doc.removeEventListener('keydown',onKey,true);win.removeEventListener('resize',fit);
   try{track(how==='done'?'tour_completed':'tour_skipped',{index:i+1,of:n})}catch{}
   root.classList.add('is-leaving');
   setTimeout(()=>{root.remove();doc.documentElement.classList.remove('is-welcoming');if(before&&doc.contains(before))before.focus?.({preventScroll:true});resolve(how)},still?0:480);
  };
  const go=d=>{const k=i+d;if(k>=n)end('done');else show(k)};
  function onKey(e){
   if(e.key==='Escape'){e.preventDefault();end('skipped')}
   else if(e.key==='ArrowRight'){e.preventDefault();go(1)}
   else if(e.key==='ArrowLeft'){e.preventDefault();go(-1)}
   else if(e.key==='Tab'){const b=[...root.querySelectorAll('button:not([hidden])')];const at=b.indexOf(doc.activeElement);e.preventDefault();b[(at+(e.shiftKey?-1:1)+b.length)%b.length]?.focus()}
  }
  root.addEventListener('click',e=>{const b=e.target.closest('[data-w]');if(!b)return;const a=b.dataset.w;if(a==='next')go(1);else if(a==='back')go(-1);else if(a==='skip')end('skipped');else if(a==='go')show(Number(b.dataset.k))});
  doc.addEventListener('keydown',onKey,true);win.addEventListener('resize',fit);
  show(0);
 });
}
