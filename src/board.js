import {metrics,defaultBoard} from './metrics.js';
export const extraWidgets=[{kind:'nutrition',name:'Today’s nutrition',group:'daily',color:'green',unit:''},{kind:'digestive',name:'Health journal',group:'daily',color:'peach',unit:''}];
export const widgetCatalog=[...metrics,...extraWidgets];
const allowed=new Set(widgetCatalog.map(m=>m.kind));
export function normalizeLayout(value,legacy){
 const defaults=[...(Array.isArray(legacy)&&legacy.length?legacy:defaultBoard).filter(id=>allowed.has(id)).map(id=>({id,size:'small'})),{id:'nutrition',size:'medium'},{id:'digestive',size:'medium'}];
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
