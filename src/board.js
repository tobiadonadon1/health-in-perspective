import {metrics,defaultBoard} from './metrics.js';
export const extraWidgets=[{kind:'nutrition',name:'Today’s nutrition',group:'daily',color:'green',unit:''},{kind:'digestive',name:'Health journal',group:'daily',color:'peach',unit:''},{kind:'measurements',name:'Measurements',group:'daily',color:'blue',unit:'readings'}];
export const widgetCatalog=[...metrics,...extraWidgets];
const allowed=new Set(widgetCatalog.map(m=>m.kind));
// Places widgets on the bento grid: the hero top-left, then row by row in the person's order. When the small
// cards left cannot fill a row, a wide card goes first, so mixed sizes tile without holes.
export function packBento(widgets,{hero=null,cols=3,startRow=1}={}){
 const size=w=>w.size==='large'?[2,2]:w.size==='medium'?[2,1]:w.id===hero?[1,2]:[1,1];
 const taken=new Set(),key=(c,r)=>c+':'+r,out=new Map(),queue=[...widgets];
 const free=(c,r,[w,h])=>{if(c+w-1>cols)return false;for(let i=0;i<w;i++)for(let j=0;j<h;j++)if(taken.has(key(c+i,r+j)))return false;return true};
 const place=(item,c,r)=>{const [w,h]=size(item);for(let i=0;i<w;i++)for(let j=0;j<h;j++)taken.add(key(c+i,r+j));out.set(item.id,{c,r,w,h});queue.splice(queue.indexOf(item),1)};
 const first=queue.find(w=>w.id===hero)||queue.find(w=>w.size==='large');if(first)place(first,1,startRow);
 for(let r=startRow;queue.length&&r<startRow+100;r++)for(let c=1;c<=cols&&queue.length;c++){
  if(taken.has(key(c,r)))continue;let run=0;while(c+run<=cols&&!taken.has(key(c+run,r)))run++;
  const smalls=queue.filter(w=>size(w)[0]===1).length,wide=run>=2&&smalls<run?queue.find(w=>size(w)[0]>1&&free(c,r,size(w))):null;
  const pick=wide||queue.find(w=>free(c,r,size(w)));if(pick){place(pick,c,r);c+=size(pick)[0]-1}
 }
 // A one-row card followed only by empty cells to the end of its row widens to close the gap.
 for(const [id,p] of out){if(p.h!==1)continue;let end=p.c+p.w;while(end<=cols&&!taken.has(key(end,p.r)))end++;if(end>cols&&end-1>p.c+p.w-1){for(let c=p.c+p.w;c<end;c++)taken.add(key(c,p.r));p.w=end-p.c}}
 return out;
}
// Bento cells: small 1, medium 2 (wide), large 4 (2×2) and the hero 2 (tall); dense packing fills the gaps.
export function boardRows(layout,{hero=null,cols=3}={}){return Math.ceil(layout.widgets.reduce((n,w)=>n+(w.size==='large'?4:w.size==='medium'||w.id===hero?2:1),0)/cols)}
export function normalizeLayout(value,legacy){
 // New boards also get the measurement count, which completes the default bento grid.
 const defaults=[...(Array.isArray(legacy)&&legacy.length?legacy:[...defaultBoard,'measurements']).filter(id=>allowed.has(id)).map(id=>({id,size:'small'})),{id:'nutrition',size:'medium'},{id:'digestive',size:'medium'}];
 if(!value||value.version!==1||!Array.isArray(value.widgets))return {version:1,widgets:defaults};
 const seen=new Set();const widgets=value.widgets.filter(w=>w&&allowed.has(w.id)&&!seen.has(w.id)&&seen.add(w.id)).slice(0,16).map(w=>({id:w.id,size:['small','medium','large'].includes(w.size)?w.size:'small'}));
 return {version:1,widgets};
}
export function moveWidget(widgets,id,target){const next=widgets.map(w=>({...w})),from=next.findIndex(w=>w.id===id);if(from<0)return next;const [w]=next.splice(from,1);next.splice(Math.max(0,Math.min(target,next.length)),0,w);return next;}
export function widgetControls(widget,index,total){const label=widgetCatalog.find(m=>m.kind===widget.id).name;return `<div class="widget-tools"><button class="widget-remove" data-remove-widget="${widget.id}" aria-label="Remove ${label}">−</button><button class="widget-grip" data-drag-widget="${widget.id}" aria-label="Move ${label}. Use arrow keys to rearrange." title="Drag to move · Arrow keys to rearrange">⠿</button><div class="widget-size" aria-label="${label} size">${[['small','S'],['medium','M'],['large','L']].map(([size,l])=>`<button data-size-widget="${widget.id}" data-size="${size}" aria-label="${label}: ${size}" aria-pressed="${size===widget.size}">${l}</button>`).join('')}</div><button class="widget-move" data-step-widget="${widget.id}" data-step="-1" aria-label="Move ${label} earlier" ${index===0?'disabled':''}>←</button><button class="widget-move" data-step-widget="${widget.id}" data-step="1" aria-label="Move ${label} later" ${index===total-1?'disabled':''}>→</button></div>`;}
export function bindWidgetEditing(root,{remove,resize,move}){
 root.querySelectorAll('[data-remove-widget]').forEach(b=>b.onclick=()=>remove(b.dataset.removeWidget));
 root.querySelectorAll('[data-size-widget]').forEach(b=>b.onclick=()=>resize(b.dataset.sizeWidget,b.dataset.size));
 root.querySelectorAll('[data-step-widget]').forEach(b=>b.onclick=()=>move(b.dataset.stepWidget,Number(b.dataset.step)));
 root.querySelectorAll('[data-drag-widget]').forEach(handle=>{
  handle.onkeydown=e=>{if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(e.key)){e.preventDefault();move(handle.dataset.dragWidget,['ArrowLeft','ArrowUp'].includes(e.key)?-1:1);root.ownerDocument.querySelector(`[data-drag-widget="${handle.dataset.dragWidget}"]`)?.focus()}};
  handle.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();const slot=handle.closest('[data-widget-id]'),id=slot.dataset.widgetId;let target=id;handle.setPointerCapture(e.pointerId);slot.classList.add('is-dragging');
   handle.onpointermove=ev=>{const over=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('[data-widget-id]');root.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));if(over&&over!==slot){target=over.dataset.widgetId;over.classList.add('drop-target')}else target=id;};
   const finish=()=>{handle.onpointermove=null;handle.onpointerup=null;handle.onpointercancel=null;slot.classList.remove('is-dragging');root.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));if(target!==id)move(id,null,target);};
   handle.onpointerup=finish;handle.onpointercancel=()=>{target=id;finish()};
  };
 });
}
