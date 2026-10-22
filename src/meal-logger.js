import {escapeHTML as esc, localDay, totals, validateMeal} from './domain.js';
const $=s=>document.querySelector(s);
const orb='<span class="orb" aria-hidden="true"><i class="orb-energy"></i><i class="orb-light"></i></span>';
export function createMealLogger({showModal,heading,icon,api,save,remove,update,getDay,getCapabilities,connectAI}){
 let messages=[],version=0,recording=null,audioStream=null,timer,photo=null,preview=null,busy=false,pending=null,hold=false,voiceStarting=false;
 function stopAudio(discard=true){clearTimeout(timer);if(recording){if(discard)recording.onstop=null;if(recording.state==='recording')recording.stop()}audioStream?.getTracks().forEach(t=>t.stop());recording=null;audioStream=null;}
 function cancel(){version++;hold=false;voiceStarting=false;stopAudio();if(preview)URL.revokeObjectURL(preview);preview=null;photo=null;busy=false;}
 function open(){cancel();messages=[];pending=null;render();}
 function messageHTML(m,i){if(m.type==='user')return `<div class="chat-message user">${m.photo?'<span class="chat-photo-note">Meal photo attached</span>':''}${esc(m.text)}</div>`;
 if(m.type==='meal'){const t=totals(m.items);return `<article class="chat-meal"><div class="chat-meal-top"><span class="tag">${m.removed?'Removed from journal':'Logged · '+esc(m.day)}</span><span class="mini-note">AI estimate</span></div><h3>${esc(m.title)}</h3><div class="chat-macros"><strong>${Math.round(t.calories)}<small>kcal</small></strong><span>${Math.round(t.protein)}g<small>protein</small></span><span>${Math.round(t.carbs)}g<small>carbs</small></span><span>${Math.round(t.fat)}g<small>fat</small></span></div><p>${m.items.map(x=>esc(x.name)+' · '+esc(x.portion||'')).join('<br>')}</p>${m.assumptions?.length?`<details class="chat-assumptions"><summary>Portions & assumptions</summary><p>${m.assumptions.map(esc).join('<br>')}</p></details>`:''}${!m.removed?`<div class="chat-meal-actions"><button type="button" data-edit-meal="${i}">Edit values</button><button type="button" data-undo-meal="${i}">Undo</button></div>`:''}<div id="meal-edit-${i}"></div></article>`}
 return `<div class="chat-message assistant ${m.type==='error'?'chat-error':''}">${esc(m.text)}</div>`;
 }
 function render(){
  const connected=getCapabilities().mealAnalysis;
  showModal(`<div class="meal-chat">${heading('What did you eat?','Your nutrition companion')}<p>Tell me in your own words. I’ll take care of the numbers.</p><div class="meal-conversation" aria-live="polite">${messages.length?messages.map(messageHTML).join(''):`<div class="chat-welcome"><button type="button" id="meal-talk-primary" class="chat-talk" aria-label="Hold the orb to talk" ${!connected?'disabled':''}>${orb}</button><h3>A little conversation.<br>A clearer picture.</h3><p>“I had a chicken bowl with rice and avocado.”</p></div>`}${busy?'<div class="chat-thinking" role="status"><span></span> Working out your meal…</div>':''}</div><div class="chat-attachment" ${preview?'':'hidden'}>${preview?`<img src="${preview}" alt="Attached meal photo"><span>Meal photo</span><button type="button" id="remove-photo" aria-label="Remove photo">${icon('close')}</button>`:''}</div><form id="meal-chat-form"><textarea id="meal-description" aria-label="Message your nutrition companion" rows="2" maxlength="4000" placeholder="I ate…" ${busy?'disabled':''}></textarea><div class="chat-composer-actions"><label class="chat-attach" title="Attach a meal photo" aria-label="Attach a meal photo">${icon('plus')}<input id="meal-photo" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Attach a meal photo" ${busy?'disabled':''}></label><span id="voice-label">Hold to talk</span><button type="button" id="meal-talk" class="chat-talk" aria-label="Hold to talk; press Space to start or stop recording" ${busy||!connected?'disabled':''}>${orb}</button><button type="submit" class="chat-send" aria-label="Send meal" ${busy||!connected?'disabled':''}>${icon('arrow')}</button></div></form>${!connected?'<p class="chat-connect">One-time setup: <button id="connect-personal-ai" type="button">connect your OpenAI key</button> to start.</p>':'<p class="chat-disclosure">Estimated macros, saved to your journal. You can edit or undo. Photos and audio are processed by OpenAI.</p>'}<p id="meal-error" class="meal-error" role="alert"></p></div>`,true);
  $('#meal-chat-form').onsubmit=e=>{e.preventDefault();submit()};
  $('#meal-description').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit()}};
  $('#meal-photo').onchange=async e=>{const file=e.target.files[0];if(!file)return;const token=version,text=$('#meal-description').value;try{const encoded=await encodePhoto(file);if(token!==version)return;if(preview)URL.revokeObjectURL(preview);preview=URL.createObjectURL(file);photo=encoded;render();$('#meal-description').value=text}catch(e){error(e.message)}};
  if($('#remove-photo'))$('#remove-photo').onclick=()=>{const text=$('#meal-description').value;if(preview)URL.revokeObjectURL(preview);photo=null;preview=null;render();$('#meal-description').value=text};
  if($('#connect-personal-ai'))$('#connect-personal-ai').onclick=()=>{cancel();connectAI()};
  document.querySelectorAll('#meal-talk,#meal-talk-primary').forEach(talk=>{talk.onpointerdown=e=>{e.preventDefault();if(busy)return;hold=true;talk.setPointerCapture(e.pointerId);beginVoice()};
  talk.onpointerup=()=>{hold=false;stopAudio(false)};talk.onpointercancel=()=>{hold=false;stopAudio();voiceStatus('Hold to talk')};
  talk.onkeydown=e=>{if([' ','Enter'].includes(e.key)&&!e.repeat){e.preventDefault();if(recording){hold=false;stopAudio(false)}else{hold=true;beginVoice()}}};});
  document.querySelectorAll('[data-undo-meal]').forEach(b=>b.onclick=async()=>{const m=messages[+b.dataset.undoMeal];b.disabled=true;try{await remove(m.saved.map(r=>r.id));m.removed=true;render()}catch(e){b.disabled=false;error(e.message)}});
  document.querySelectorAll('[data-edit-meal]').forEach(b=>b.onclick=()=>edit(+b.dataset.editMeal));
  const conversation=$('.meal-conversation');conversation.scrollTop=conversation.scrollHeight;
 }
 function error(text){const e=$('#meal-error');if(e)e.textContent=text}
 function voiceStatus(text){const e=$('#voice-label');if(e)e.textContent=text;document.querySelectorAll('#meal-talk,#meal-talk-primary').forEach(el=>el.classList.toggle('recording',text.startsWith('Listening')));}
 async function submit(transcript){
  if(busy)return;if(!getCapabilities().mealAnalysis)return error('Connect your OpenAI key to start.');
  const text=transcript??$('#meal-description').value.trim();if(!text&&!photo)return;hold=false;stopAudio();
  const token=version,image=photo;messages.push({type:'user',text,photo:!!image});busy=true;
  if(preview)URL.revokeObjectURL(preview);preview=null;photo=null;render();
  try{
   const response=await api('nutrition-analyze',pending?{text:pending.text,image:pending.image,previous:pending.estimate,correction:text}:{text,image:image||undefined});
   if(token!==version)return;const meal=response.meal;
   if(!meal.items.length||meal.question){pending={text:pending?.text||text,image:pending?.image||image,estimate:meal};messages.push({type:'assistant',text:meal.question||'Tell me a little more about your meal and portion.'});}
   else{
    const day=getDay(),hour=new Date().getHours(),type=hour<11?'Breakfast':hour<16?'Lunch':hour<22?'Dinner':'Snack';
    const rows=meal.items.map(item=>({...validateMeal(item),source:('AI estimate · '+item.portion).slice(0,500),meal_type:type,logged_on:day}));
    const saved=await save(rows);if(token!==version)return;messages.push({type:'meal',title:meal.title,items:meal.items,assumptions:meal.assumptions,day,saved});pending=null;
   }
  }catch(e){if(token!==version)return;messages.push({type:'error',text:e.message+' Your meal was not logged.'});}
  finally{if(token===version){busy=false;render();$('#meal-description').focus()}}
 }
 async function beginVoice(){
  if(recording||busy||voiceStarting)return;if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return error('Voice recording is not supported here. Type your meal instead.');
  const token=version;voiceStarting=true;voiceStatus('Opening microphone…');
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});if(token!==version||!hold){stream.getTracks().forEach(t=>t.stop());voiceStatus('Hold to talk');return}
   audioStream=stream;const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
   const recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined),chunks=[];recording=recorder;const started=Date.now();
   recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
   recorder.onstop=async()=>{clearTimeout(timer);stream.getTracks().forEach(t=>t.stop());recording=null;audioStream=null;if(token!==version)return;voiceStatus('Hold to talk');if(Date.now()-started<600)return error('Hold the orb while speaking, then release to send.');busy=true;render();try{const file=new Blob(chunks,{type:recorder.mimeType});if(!file.size||file.size>5*1024*1024)throw Error('Keep your voice note under one minute.');const r=await api('transcribe',{audio:await toDataURL(file)});if(token!==version)return;if(!r.text?.trim())throw Error('I didn’t catch that. Try again or type your meal.');busy=false;await submit(r.text.slice(0,4000))}catch(e){if(token===version){busy=false;render();error(e.message)}}};
   recorder.onerror=()=>{stopAudio();voiceStatus('Hold to talk');error('Recording stopped. Please try again.')};
   recorder.start();voiceStatus('Listening… release to log');timer=setTimeout(()=>{hold=false;stopAudio(false)},60000);
  }catch(e){stopAudio();voiceStatus('Hold to talk');error(e.name==='NotAllowedError'?'Allow microphone access to talk, or type your meal.':e.message)}finally{if(token===version)voiceStarting=false}
 }
 function edit(index){const m=messages[index],host=$('#meal-edit-'+index);host.innerHTML=`<form class="chat-edit-form">${m.items.map((x,i)=>`<fieldset><legend>${esc(x.name)}</legend>${['calories','protein','carbs','fat'].map(k=>`<label>${k}<input aria-label="${k} for ${esc(x.name)}" name="${i}-${k}" type="number" min="0" max="10000" step=".1" required value="${x[k]}"></label>`).join('')}</fieldset>`).join('')}<button class="btn light" type="submit">Save changes</button></form>`;host.querySelector('form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{const values=new FormData(e.target),items=m.items.map((x,i)=>({...x,...Object.fromEntries(['calories','protein','carbs','fat'].map(k=>[k,Number(values.get(i+'-'+k))]))}));await update(items.map((x,i)=>({...m.saved[i],...validateMeal(x),source:'AI estimate · values edited'})));m.items=items;render()}catch(e){b.disabled=false;error(e.message)}};}
 return {open,cancel};
}
function toDataURL(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('This file could not be read.'));reader.readAsDataURL(file)});}
async function encodePhoto(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('Choose a JPG, PNG or WebP photo under 10 MB.');const bitmap=await createImageBitmap(file),scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return canvas.toDataURL('image/jpeg',.85);}
