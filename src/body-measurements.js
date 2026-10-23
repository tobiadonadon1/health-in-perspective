import {metrics,formatValue} from './metrics.js';
import {escapeHTML as esc,localDay} from './domain.js';
export const manualSource='Manual entry';
export function validateMeasurement({id,kind,value,measured_on}){
 const metric=metrics.find(m=>m.kind===kind&&m.group==='body'),n=Number(value);
 if(!metric)throw Error('Choose weight, body fat or lean body mass.');
 if(value===''||!Number.isFinite(n)||n<=0||n>(kind==='body_fat'?100:1000))throw Error(kind==='body_fat'?'Enter a percentage greater than 0 and no more than 100.':'Enter a measurement greater than 0 and no more than 1,000 kg.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(measured_on)||!Number.isFinite(Date.parse(measured_on))||new Date(measured_on).toISOString().slice(0,10)!==measured_on||measured_on>localDay()||measured_on<'1900-01-01')throw Error('Choose today or an earlier measurement date.');
 return {id,kind,value:n,measured_on};
}
export function openBodyMeasurement({kind,readings,save,remove,onChanged,showModal,heading,closeModal,openTrend}){
 const metric=metrics.find(m=>m.kind===kind&&m.group==='body');if(!metric)return;
 let currentId=crypto.randomUUID();
 const rows=readings.filter(r=>r.kind===kind&&r.source===manualSource).slice(0,20);
 showModal(`${heading(metric.name,'Your measurements')}<p>Add a measurement from your scale, a scan or your own records.</p><form id="body-measurement-form"><div class="form-grid"><label class="field">${metric.name} (${metric.unit})<input name="value" type="number" inputmode="decimal" step="any" min="0.01" max="${kind==='body_fat'?100:1000}" placeholder="${kind==='body_fat'?'e.g. 18.5':'e.g. 72.5'}" required></label><label class="field">Measurement date<input name="measured_on" type="date" value="${localDay()}" max="${localDay()}" min="1900-01-01" required></label></div><p class="mini-note">Saved privately as a manual entry, with your measurement date.</p><div id="body-form-error" role="alert"></div><div class="dialog-footer"><button type="button" class="text-button" id="body-cancel-edit" hidden>Cancel edit</button><button class="btn" type="submit">Save measurement</button></div></form>${rows.length?`<div class="measurement-history"><h3>Your recent entries</h3>${rows.map(r=>`<div class="measurement-row"><div><strong>${formatValue(r.value,kind)} <small>${metric.unit}</small></strong><span>${new Date(r.observed_at).toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'})}</span></div><button class="text-button" data-edit-measurement="${esc(r.id)}">Edit</button><button class="text-button delete-button" data-remove-measurement="${esc(r.id)}">Delete</button></div>`).join('')}</div>`:''}${readings.some(r=>r.kind===kind)?'<button class="text-button measurement-trend" id="body-show-trend">Explore the trend ↗</button>':''}`);
 const form=document.querySelector('#body-measurement-form'),submit=form.querySelector('[type=submit]'),feedback=document.querySelector('#body-form-error'),cancel=document.querySelector('#body-cancel-edit');
 function error(e){feedback.className='error';feedback.textContent=e.message;}
 cancel.onclick=()=>{currentId=crypto.randomUUID();form.reset();cancel.hidden=true;submit.textContent='Save measurement'};
 form.onsubmit=async e=>{e.preventDefault();if(submit.disabled)return;submit.disabled=true;feedback.textContent='';try{await save(validateMeasurement({id:currentId,kind,...Object.fromEntries(new FormData(form))}));closeModal();await onChanged();}catch(e){error(e)}finally{submit.disabled=false}};
 document.querySelectorAll('[data-edit-measurement]').forEach(b=>b.onclick=()=>{if(submit.disabled)return;const r=rows.find(r=>r.id===b.dataset.editMeasurement);currentId=r.id;form.elements.value.value=r.value;form.elements.measured_on.value=r.observed_at.slice(0,10);cancel.hidden=false;submit.textContent='Update measurement';form.elements.value.focus()});
 document.querySelectorAll('[data-remove-measurement]').forEach(b=>b.onclick=async()=>{if(submit.disabled)return;if(b.dataset.confirm!=='yes'){b.dataset.confirm='yes';b.textContent='Confirm delete';return}submit.disabled=true;b.disabled=true;try{await remove(b.dataset.removeMeasurement);closeModal();await onChanged()}catch(e){error(e)}finally{submit.disabled=false;b.disabled=false}});
 document.querySelector('#body-show-trend')?.addEventListener('click',()=>openTrend(kind));
 form.elements.value.focus();
}
