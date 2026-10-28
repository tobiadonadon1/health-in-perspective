import {metrics} from './metrics.js';
// The signal tiles the person follows on Home, in their order. Calories, weight and today's check-in have
// fixed places on Home, so only metrics are chosen here.
export const BOARD_LIMIT=6;
// What Home shows first: the numbers WHOOP members check every day.
export const homeDefaults=['recovery','hrv','resting_hr','sleep','strain','heart_rate'];
export const widgetCatalog=metrics;
const allowed=new Set(metrics.map(m=>m.kind));
export function normalizeLayout(value){
 const defaults=homeDefaults.filter(id=>allowed.has(id)).map(id=>({id,size:'small'}));
 // Version 2 is the tile dashboard; boards saved for the earlier layout start again from the defaults.
 if(!value||value.version!==2||!Array.isArray(value.widgets))return {version:2,widgets:defaults};
 const seen=new Set();const widgets=value.widgets.filter(w=>w&&allowed.has(w.id)&&!seen.has(w.id)&&seen.add(w.id)).slice(0,BOARD_LIMIT).map(w=>({id:w.id,size:['small','medium','large'].includes(w.size)?w.size:'small'}));
 return {version:2,widgets};
}
export function moveWidget(widgets,id,target){const next=widgets.map(w=>({...w})),from=next.findIndex(w=>w.id===id);if(from<0)return next;const [w]=next.splice(from,1);next.splice(Math.max(0,Math.min(target,next.length)),0,w);return next;}
export function bindWidgetEditing(root,{remove,move}){
 root.querySelectorAll('[data-remove-widget]').forEach(b=>b.onclick=()=>remove(b.dataset.removeWidget));
 root.querySelectorAll('[data-step-widget]').forEach(b=>b.onclick=()=>move(b.dataset.stepWidget,Number(b.dataset.step)));
}
