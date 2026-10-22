import {escapeHTML as esc, localDay, totals, validateMeal} from './domain.js';

const nutrients=[['calories','Calories','kcal'],['protein','Protein','g'],['carbs','Carbs','g'],['fat','Fat','g']];
const $=s=>document.querySelector(s);
export function createMealLogger({showModal,heading,icon,api,save,getDay,getCapabilities,connectAI}){
  let state,version=0,recorder,stream,timer,previewUrl;
  function stopCapture(){clearInterval(timer);if(recorder){recorder.onstop=null;recorder.onerror=null;if(recorder.state==='recording')recorder.stop()}stream?.getTracks().forEach(t=>t.stop());recorder=null;stream=null;}
  function cancel(){version++;stopCapture();if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;}
  function error(message){const el=$('#meal-error');if(el)el.textContent=message;}
  function header(title='What’s on your plate?'){return heading(title,'Nutrition / Your daily journal');}
  function open(mode='describe'){
    cancel();state={mode,text:'',image:null,estimate:null,meal_type:'Lunch',logged_on:getDay()};render();
  }
  function render(){
    const enabled=getCapabilities().mealAnalysis,voice=getCapabilities().transcription;
    const tabs=[['describe','Describe',icon('food')],['photo','Photo',icon('camera')],['voice','Speak',icon('mic')],['manual','Enter facts',icon('plus')]];
    showModal(`${header()}<p>A photo, a few words, or a quick voice note. Make it part of your day.</p><div class="meal-tabs" role="tablist" aria-label="How to log your meal">${tabs.map(([mode,label,symbol])=>`<button type="button" role="tab" aria-selected="${state.mode===mode}" data-log-mode="${mode}">${symbol}${label}</button>`).join('')}</div>${state.mode==='manual'?manualForm():`<form id="meal-capture">${state.mode==='photo'?`<label class="meal-photo-picker">${previewUrl?`<img src="${previewUrl}" alt="Your meal, ready to analyze">`:`<span class="capture-icon">${icon('camera')}</span><strong>Let’s see what’s on your plate.</strong><span>Choose a meal photo or a nutrition label</span>`}<input id="meal-photo" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Meal photo"></label>`:''}${state.mode==='voice'?`<div class="voice-capture"><div class="voice-orbit">${icon('mic')}</div><h3>Tell me what you ate.</h3><p>Include portions, drinks and any brand names you know.</p><button type="button" class="btn light" id="meal-record" ${!enabled||!voice?'disabled':''}>${icon('mic')} Start recording</button><span id="recording-time" role="status">Up to 60 seconds</span></div>`:''}<label class="field">${state.mode==='photo'?'Anything else? (optional)':state.mode==='voice'?'Your words':'What did you eat?'}<textarea id="meal-description" maxlength="4000" rows="4" placeholder="I had two eggs, a slice of sourdough with butter, and an oat milk cappuccino." ${state.mode==='voice'?'aria-label="Your words"':''}>${esc(state.text)}</textarea></label><div class="meal-examples"><span>Small details help.</span><span>Portion size</span><span>Cooking oils</span><span>Brand name</span></div>${!enabled?'<div class="assistant-pending"><strong>Bring your own AI.</strong> Connect your OpenAI API key to analyze photos, descriptions and voice notes. <button type="button" id="connect-personal-ai">Connect my key</button> · <button type="button" id="manual-fallback">Enter facts instead</button></div>':''}<p class="mini-note">${state.mode==='voice'?'Audio is sent to OpenAI after you stop recording. ':''}Your submitted photo and description are sent to OpenAI to estimate nutrition. Review portions before saving. Photos and audio are not saved in your journal.</p><p id="meal-error" class="meal-error" role="alert"></p><div class="dialog-footer"><span class="meal-private">${icon('shield')} Your private food journal</span><button class="btn" type="submit" ${!enabled?'disabled':''}>Analyze meal ${icon('arrow')}</button></div></form>`}`,true);
    document.querySelectorAll('[data-log-mode]').forEach(b=>b.onclick=()=>{state.text=$('#meal-description')?.value??state.text;version++;stopCapture();state.mode=b.dataset.logMode;render()});
    if($('#connect-personal-ai'))$('#connect-personal-ai').onclick=()=>{cancel();connectAI()};
    if($('#manual-fallback'))$('#manual-fallback').onclick=()=>{state.mode='manual';render()};
    if($('#manual-meal'))bindManual();
    if($('#meal-capture'))$('#meal-capture').onsubmit=e=>{e.preventDefault();state.text=$('#meal-description').value;analyze()};
    if($('#meal-photo'))$('#meal-photo').onchange=async e=>{
      const file=e.target.files[0];if(!file)return;
      state.text=$('#meal-description').value;const requestVersion=++version;
      try{
        const encoded=await encodePhoto(file);
        if(version!==requestVersion)return;
        if(previewUrl)URL.revokeObjectURL(previewUrl);
        previewUrl=URL.createObjectURL(file);state.image=encoded;render();
      }catch(e){if(version===requestVersion)error(e.message)}
    };
    if($('#meal-record'))$('#meal-record').onclick=record;
  }
  function lockCapture(label){const form=$('#meal-capture');if(!form)return;form.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=true);const submit=form.querySelector('[type=submit]');submit.textContent=label;document.querySelectorAll('[data-log-mode]').forEach(el=>el.disabled=true);}
  async function analyze(correction=''){
    if(!getCapabilities().mealAnalysis)return error('Connect your OpenAI API key to use meal analysis.');
    if(!state.text.trim()&&!state.image)return error('Describe your meal or add a photo first.');
    stopCapture();const requestVersion=++version;lockCapture('Looking at your meal…');
    try{
      const result=await api('nutrition-analyze',{text:state.text,image:state.image||undefined,correction,previous:correction?state.estimate:undefined});
      if(version!==requestVersion)return;
      state.estimate=result.meal;
      if(!result.meal.items.length){render();error(result.meal.question||'No food was identified. Try another image or describe your meal.');return;}
      review();
    }catch(e){if(version===requestVersion){render();error(e.message)}}
  }
  function dayFields(){return `<div class="form-grid meal-day-fields"><label class="field">Meal<select name="meal_type">${['Breakfast','Lunch','Dinner','Snack'].map(n=>`<option ${state.meal_type===n?'selected':''}>${n}</option>`).join('')}</select></label><label class="field">Date<input name="logged_on" type="date" required max="${localDay()}" value="${state.logged_on}"></label></div>`;}
  function summary(rows){const total=totals(rows);return `<div class="meal-estimate-total">${nutrients.map(([key,label,unit])=>`<div><span>${label}</span><strong>${Math.round(total[key])}<small>${unit}</small></strong></div>`).join('')}</div>`;}
  function review(){
    const estimate=state.estimate;
    showModal(`${header('A closer look at your meal.')}<div class="meal-review-title"><h3>${esc(estimate.title)}</h3><span class="tag warm">Estimated nutrition</span></div><div id="meal-summary">${summary(estimate.items)}</div><form id="meal-review"><div class="meal-items">${estimate.items.map((item,i)=>`<fieldset class="meal-review-item" data-item="${i}"><legend>Food ${i+1}</legend><div class="item-name-row"><label class="field">Food<input name="name" required maxlength="200" value="${esc(item.name)}"></label><button type="button" class="icon-btn" data-remove-item="${i}" aria-label="Remove ${esc(item.name)}">${icon('trash')}</button></div><label class="field portion-field">Portion used<input name="portion" required maxlength="240" value="${esc(item.portion)}"></label><div class="item-macros">${nutrients.map(([key,label,unit])=>`<label>${label}<span><input aria-label="${label} for food ${i+1}" name="${key}" type="number" min="0" max="10000" step=".1" required value="${item[key]}">${unit}</span></label>`).join('')}</div></fieldset>`).join('')}</div>${estimate.assumptions.length?`<div class="meal-assumptions"><strong>What I assumed</strong><ul>${estimate.assumptions.map(a=>`<li>${esc(a)}</li>`).join('')}</ul></div>`:''}${estimate.question?`<p class="mini-note">${esc(estimate.question)}</p>`:''}<details class="meal-refine"><summary>Change something in your own words</summary><textarea id="meal-correction" maxlength="2000" rows="2" placeholder="Actually, I only ate half the rice and used olive oil."></textarea><button class="btn light" type="button" id="refine-meal">Update estimate</button></details>${dayFields()}<p class="mini-note">Changing a portion description alone does not recalculate macros. Use “Update estimate” to recalculate, or edit the values directly.</p><p id="meal-error" class="meal-error" role="alert"></p><div class="dialog-footer"><button type="button" class="text-button" id="meal-back">Back to your meal</button><button class="btn" type="submit">Save to journal ${icon('plus')}</button></div></form>`,true);
    const readItems=()=>[...document.querySelectorAll('[data-item]')].map(el=>Object.fromEntries([...el.querySelectorAll('input')].map(input=>[input.name,input.value])));
    $('#meal-review').oninput=()=>{$('#meal-summary').innerHTML=summary(readItems());};
    document.querySelectorAll('[data-remove-item]').forEach(b=>b.onclick=()=>{const el=b.closest('fieldset');el.remove();$('#meal-summary').innerHTML=summary(readItems());});
    $('#meal-back').onclick=()=>render();
    $('#refine-meal').onclick=async()=>{
      const correction=$('#meal-correction').value.trim();if(!correction)return error('Describe what should change.');
      try{const items=readItems().map(item=>({...validateMeal(item),portion:item.portion,confidence:'medium'}));state.estimate={...estimate,items};}catch(e){return error(e.message)}
      const fields=new FormData($('#meal-review'));state.meal_type=fields.get('meal_type');state.logged_on=fields.get('logged_on');const btn=$('#refine-meal');document.querySelectorAll('#meal-review button,#meal-review input,#meal-review textarea,#meal-review select').forEach(el=>el.disabled=true);btn.textContent='Updating…';await analyze(correction);
    };
    $('#meal-review').onsubmit=async e=>{
      e.preventDefault();const form=e.target,b=form.querySelector('[type=submit]');if(b.disabled)return;
      const fields=new FormData(form);const items=readItems();if(!items.length)return error('Keep at least one food to save.');
      b.disabled=true;b.textContent='Saving…';
      try{await save(items.map(item=>({...validateMeal(item),source:('AI estimate · '+item.portion+' · reviewed').slice(0,500),meal_type:fields.get('meal_type'),logged_on:fields.get('logged_on')})));}catch(e){error(e.message);b.disabled=false;b.textContent='Save to journal';}
    };
  }
  function manualForm(){return `<form id="manual-meal"><label class="field">Meal name<input name="name" required maxlength="200" placeholder="e.g. Yogurt with berries"></label><div class="form-grid">${nutrients.map(([key,label,unit])=>`<label class="field">${label} (${unit})<input name="${key}" type="number" required min="0" max="10000" step=".1"></label>`).join('')}</div>${dayFields()}<p id="meal-error" class="meal-error" role="alert"></p><div class="dialog-footer"><p>Enter the nutrition facts for the portion you ate.</p><button class="btn" type="submit">Save meal</button></div></form>`;}
  function bindManual(){$('#manual-meal').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('[type=submit]');if(b.disabled)return;b.disabled=true;try{await save([{...Object.fromEntries(new FormData(e.target)),source:'Nutrition facts'}])}catch(e){error(e.message);b.disabled=false}};}
  async function record(){
    const b=$('#meal-record');if(recorder?.state==='recording'){recorder.stop();return;}
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return error('This browser does not support recording. You can type the same description.');
    const requestVersion=++version;b.disabled=true;
    try{
      const audio=await navigator.mediaDevices.getUserMedia({audio:true});
      if(version!==requestVersion){audio.getTracks().forEach(t=>t.stop());return;}
      stream=audio;const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
      recorder=new MediaRecorder(audio,mime?{mimeType:mime}:undefined);const chunks=[];const active=recorder;
      active.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
      active.onstop=async()=>{
        clearInterval(timer);audio.getTracks().forEach(t=>t.stop());stream=null;recorder=null;if(version!==requestVersion)return;
        lockCapture('Listening to your note…');
        try{
          const file=new Blob(chunks,{type:active.mimeType});if(!file.size||file.size>5*1024*1024)throw Error('Please record between one second and one minute.');
          const result=await api('transcribe',{audio:await toDataURL(file)});if(version!==requestVersion)return;
          if(typeof result.text!=='string'||!result.text.trim())throw Error('No words were recognized. Please try again.');
          state.text=result.text.slice(0,4000);render();await analyze();
        }catch(e){if(version===requestVersion){render();error(e.message)}}
      };
      active.onerror=()=>{stopCapture();render();error('Recording stopped unexpectedly. Please try again.');};
      active.start();b.disabled=false;b.textContent='Stop & analyze';let seconds=0;
      $('#recording-time').textContent='Recording · 0:00';$('#meal-capture [type=submit]').disabled=true;
      timer=setInterval(()=>{seconds++;const label=$('#recording-time');if(label)label.textContent=`Recording · 0:${String(seconds).padStart(2,'0')}`;if(seconds>=60)active.stop();},1000);
    }catch(e){stopCapture();if(b.isConnected)b.disabled=false;error(e.name==='NotAllowedError'?'Microphone access was not granted. You can type your meal instead.':e.message);}
  }
  return {open,cancel};
}
function toDataURL(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('This file could not be read.'));reader.readAsDataURL(file)});}
async function encodePhoto(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('Choose a JPG, PNG or WebP photo under 10 MB.');
  const bitmap=await createImageBitmap(file),scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  return canvas.toDataURL('image/jpeg',.85);
}
