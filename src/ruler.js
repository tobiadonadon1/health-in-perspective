// Ruler field: a big number the person can type, over a ruler they can drag, scroll or step with the keyboard.
// rulerField() returns markup; bindRuler() wires every ruler inside a root. The text input is the form value:
// it keeps `required`, a `pattern` and a range check through setCustomValidity, so native validation and
// form-errors.js work unchanged. Programmatic changes: set input.value, then dispatch an `input` event.

const RANGES={
 weight:{min:30,max:250,fallback:70,name:'Weight',noun:'a weight'},
 lean_mass:{min:20,max:150,fallback:55,name:'Lean body mass',noun:'a lean body mass'},
 body_fat:{min:3,max:60,fallback:20,name:'Body fat',noun:'a body fat percentage'}
};
const PX=60;// pixels per whole unit: a fine tick every 0.1 (6px), a medium tick every 1, a labelled major tick every 5
let seq=0;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const snap=v=>Math.round(v*10)/10;
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const fmt=v=>snap(v).toFixed(1);
const spoken=u=>u==='kg'?'kilograms':u==='%'?'percent':u;
const withUnit=(v,u)=>u==='%'?`${v}%`:`${v} ${u}`;
function parse(raw){const s=String(raw??'').trim().replace(/,/g,'.');return /^(\d+\.?\d*|\.\d+)$/.test(s)?Number(s):null}

export function rulerField({kind,name='value',value=null,unit,id}={}){
 const r=RANGES[kind];if(!r)throw Error(`Unknown ruler kind: ${kind}`);
 unit=unit||(kind==='body_fat'?'%':'kg');id=id||`ruler-${kind}-${++seq}`;
 const n=value===null||value===undefined||value===''?NaN:Number(value),has=Number.isFinite(n);
 const at=clamp(has?n:r.fallback,r.min,r.max),text=has?String(n):'';
 const labels=[];for(let v=Math.ceil(r.min);v<=r.max;v++)labels.push(`<span${v%5===0?' class="major"':''} style="left:${(v-r.min)*PX}px">${v}</span>`);
 const valuetext=has?withUnit(text,spoken(unit)):`Not set. Scale at ${withUnit(fmt(at),spoken(unit))}`;
 return `<div class="ruler-field${has?'':' is-empty'}" data-ruler="${esc(kind)}" data-unit="${esc(unit)}">`
 +`<label class="ruler-readout" for="${esc(id)}"><span class="sr-only">${esc(r.name)} in ${esc(unit)}</span>`
 +`<input class="ruler-input" id="${esc(id)}" name="${esc(name)}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" enterkeyhint="done" required pattern="\\d{1,3}([.,]\\d{0,2})?" title="Enter a number like ${fmt(r.fallback+.5)}" placeholder="${fmt(r.fallback)}" value="${esc(text)}">`
 +`<span class="ruler-unit" aria-hidden="true">${esc(unit)}</span></label>`
 +`<div class="ruler" id="${esc(id)}-scale" role="slider" tabindex="0" aria-label="${esc(r.name)} scale" aria-controls="${esc(id)}" aria-orientation="horizontal" aria-valuemin="${r.min}" aria-valuemax="${r.max}" aria-valuenow="${snap(at)}" aria-valuetext="${esc(valuetext)}">`
 +`<div class="ruler-window" aria-hidden="true"><div class="ruler-track" style="width:${(r.max-r.min)*PX+2}px;--major-x:${((5-r.min%5)%5)*PX-1}px;transform:translateX(${-(at-r.min)*PX}px)">${labels.join('')}</div></div>`
 +`<span class="ruler-needle" aria-hidden="true"></span></div>`
 +`<p class="ruler-hint" aria-hidden="true">Drag the scale or type a number</p></div>`;
}

export function bindRuler(root=document){root?.querySelectorAll('[data-ruler]').forEach(field=>{if(field.dataset.rulerBound)return;field.dataset.rulerBound='true';bind(field)})}

function bind(field){
 const r=RANGES[field.dataset.ruler],unit=field.dataset.unit,{min,max,fallback}=r;
 const input=field.querySelector('.ruler-input'),scale=field.querySelector('.ruler'),track=field.querySelector('.ruler-track');
 if(!input||!scale||!track)return;
 const reduce=matchMedia('(prefers-reduced-motion: reduce)'),autosize=!(window.CSS?.supports?.('field-sizing','content'));
 let pos=clamp(parse(input.value)??fallback,min,max),silent=false,drag=null,frame=0,wheelTimer=0,justFocused=false,committed=input.value;

 const empty=()=>input.value.trim()==='';
 function size(){if(!autosize)return;const s=input.value||input.placeholder,dots=(s.match(/[.,]/g)||[]).length;input.style.width=`calc(${s.length-dots+dots*.45}ch + 24px)`}
 function aria(){scale.setAttribute('aria-valuenow',String(snap(pos)));scale.setAttribute('aria-valuetext',empty()?`Not set. Scale at ${withUnit(fmt(pos),spoken(unit))}`:withUnit(input.value.trim(),spoken(unit)))}
 function validity(){const n=parse(input.value);input.setCustomValidity(n!==null&&(n<min||n>max)?`Enter ${r.noun} from ${min} to ${withUnit(max,unit)}.`:'')}
 function place(p,glide=false){
  pos=clamp(p,min,max);const dpr=window.devicePixelRatio||1,x=Math.round(-(pos-min)*PX*dpr)/dpr;
  track.classList.toggle('is-gliding',glide&&!reduce.matches);track.style.transform=`translateX(${x}px)`;
 }
 // Reads where a glide currently is, so grabbing mid-animation does not jump.
 function settle(){if(!track.classList.contains('is-gliding'))return;const m=new DOMMatrixReadOnly(getComputedStyle(track).transform);track.classList.remove('is-gliding');place(min-m.m41/PX)}
 // Ends any momentum or wheel run where it is, snapped, and reports the change.
 function halt(grab=true){const running=frame||wheelTimer;cancelAnimationFrame(frame);frame=0;clearTimeout(wheelTimer);wheelTimer=0;if(grab)settle();return running}
 function stop(){if(halt()){const t=snap(pos);place(t);write(t);changed()}}
 function changed(){if(input.value!==committed){committed=input.value;emit('change')}}
 function emit(type){silent=true;try{input.dispatchEvent(new Event(type,{bubbles:true}))}finally{silent=false}}
 // Writes the ruler's value into the input (one decimal) and tells listeners.
 function write(v){
  const text=fmt(clamp(v,min,max));field.classList.remove('is-empty');input.setCustomValidity('');
  if(input.value!==text){input.value=text;size();emit('input')}aria();
 }
 function commit(v,glide=true){const t=clamp(snap(v),min,max);place(t,glide);write(t);changed()}
 // Typed text drives the ruler.
 function sync(){committed=input.value;const n=parse(input.value);field.classList.toggle('is-empty',empty());validity();size();if(n!==null)place(n,true);aria()}

 input.addEventListener('input',()=>{
  if(silent)return;
  if(input.value.includes(',')){const at=input.selectionStart;input.value=input.value.replace(/,/g,'.');if(at!==null)input.setSelectionRange(at,at)}
  halt();sync();
 });
 input.addEventListener('change',()=>{if(silent)return;const n=parse(input.value);if(n!==null&&n>=min&&n<=max&&input.value!==fmt(n)){input.value=fmt(n);sync()}});
 input.addEventListener('keydown',e=>{
  if(e.key!=='ArrowUp'&&e.key!=='ArrowDown')return;e.preventDefault();
  halt(false);const n=parse(input.value),base=n===null?snap(pos):clamp(n,min,max);commit(base+(e.key==='ArrowUp'?1:-1)*(e.shiftKey?1:.1));
 });
 input.addEventListener('focus',()=>{justFocused=true;input.select()});
 input.addEventListener('mouseup',e=>{if(justFocused)e.preventDefault();justFocused=false});
 input.addEventListener('blur',()=>{justFocused=false});
 input.form?.addEventListener('reset',()=>setTimeout(()=>{halt();sync()}));

 scale.addEventListener('keydown',e=>{
  const steps={ArrowRight:.1,ArrowUp:.1,ArrowLeft:-.1,ArrowDown:-.1,PageUp:5,PageDown:-5};let target;
  if(e.key==='Home')target=min;else if(e.key==='End')target=max;
  else if(e.key in steps){const s=steps[e.key];target=snap(pos)+(e.shiftKey&&Math.abs(s)<1?s*10:s)}
  else return;
  e.preventDefault();halt(false);commit(target);
 });

 scale.addEventListener('pointerdown',e=>{
  if(e.button!==0||drag)return;stop();
  drag={id:e.pointerId,x:e.clientX,from:pos,moved:false,samples:[[e.timeStamp,e.clientX]]};
  scale.setPointerCapture?.(e.pointerId);field.classList.add('is-dragging');
 });
 scale.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x;
  if(!drag.moved&&Math.abs(dx)<4)return;drag.moved=true;
  place(drag.from-dx/PX);write(pos);
  drag.samples.push([e.timeStamp,e.clientX]);if(drag.samples.length>6)drag.samples.shift();
 });
 function release(e,cancelled){
  if(!drag||e.pointerId!==drag.id)return;const d=drag;drag=null;field.classList.remove('is-dragging');
  if(!d.moved){if(cancelled)return;const box=scale.getBoundingClientRect();commit(pos+(e.clientX-(box.left+box.width/2))/PX);return}
  const recent=d.samples.filter(([t])=>e.timeStamp-t<100),[t0,x0]=recent[0]||d.samples[0],[t1,x1]=d.samples.at(-1);
  let v=t1>t0?(x1-x0)/(t1-t0):0;// px per ms; positive = dragged right = lower values
  const done=()=>{const t=snap(pos);place(t,true);write(t);changed()};
  if(cancelled||reduce.matches||Math.abs(v)<.25){done();return}
  let last=performance.now();
  const step=now=>{const dt=Math.min(32,now-last);last=now;place(pos-v*dt/PX);write(pos);v*=Math.pow(.94,dt/16);
   if(Math.abs(v)<.03||pos<=min||pos>=max){frame=0;done();return}frame=requestAnimationFrame(step)};
  frame=requestAnimationFrame(step);
 }
 scale.addEventListener('pointerup',e=>release(e,false));
 scale.addEventListener('pointercancel',e=>release(e,true));
 scale.addEventListener('lostpointercapture',e=>{if(drag&&e.pointerId===drag.id)release(e,true)});

 scale.addEventListener('wheel',e=>{
  const d=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;if(!d||drag)return;
  const px=d*(e.deltaMode===1?16:e.deltaMode===2?scale.clientWidth:1),next=clamp(pos+px/PX,min,max);
  if(next===pos)return;// at either end, let the page scroll on
  e.preventDefault();cancelAnimationFrame(frame);frame=0;settle();
  place(next);write(pos);clearTimeout(wheelTimer);
  wheelTimer=setTimeout(()=>{wheelTimer=0;const t=snap(pos);place(t,true);write(t);changed()},140);
 },{passive:false});

 validity();size();aria();
}
