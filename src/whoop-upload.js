// WHOOP CSV upload (free on every plan): its own page at #/whoop-import. The person requests WHOOP's data export, then drops
// the zip or its CSVs here. Files are read in a worker on this device; a preview (date range, counts per file type and per
// measurement) is confirmed before anything is saved. Re-uploading is safe: every row has a stable id (wearable-import.js).
import './ui/whoop-upload.css';
import {metrics} from './metrics.js';
import {dateLocale} from './domain.js';
export const WHOOP_IMPORT_HASH='#/whoop-import';
// WHOOP's download link expires after 7 days, and a week is when a fresh export starts to be worth it.
export const WHOOP_REUPLOAD_DAYS=7;
const BATCH=2000,DAY=86400000;
export function openWhoopImportPage(){if(location.hash!==WHOOP_IMPORT_HASH)location.hash=WHOOP_IMPORT_HASH}
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const extraNames={workout:'Workout duration',workout_strain:'Workout strain',workout_energy:'Workout calories',workout_avg_hr:'Workout average heart rate',workout_max_hr:'Workout max heart rate'};
const kindName=k=>metrics.find(m=>m.kind===k)?.name||extraNames[k]||k.replace(/_/g,' ');
const count=n=>Number(n||0).toLocaleString(dateLocale);
const plural=(n,one,many=one+'s')=>`${count(n)} ${n===1?one:many}`;
export const formatDay=d=>d?new Date(d+'T12:00:00Z').toLocaleDateString(dateLocale,{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'';
export function daysSince(iso,now=Date.now()){const t=Date.parse(iso);return Number.isFinite(t)?Math.max(0,Math.floor((now-t)/DAY)):null}
export function lastImportHTML(lastImport,{esc=escape,now=Date.now()}={}){
 if(!lastImport?.imported_at)return '<p class="wu-last-none">You haven’t uploaded WHOOP data yet.</p>';
 const days=daysSince(lastImport.imported_at,now),when=days===0?'today':days===1?'yesterday':`${count(days)} days ago`,date=new Date(lastImport.imported_at);
 const range=lastImport.first_day&&lastImport.last_day?` · ${esc(formatDay(lastImport.first_day))} to ${esc(formatDay(lastImport.last_day))}`:'';
 return `<div class="wu-last-row"><span class="status-pill on">Last upload <time datetime="${esc(date.toISOString())}">${esc(when)}</time></span><span class="wu-last-meta">${esc(plural(lastImport.row_count||0,'measurement'))}${range}</span></div>${days>=WHOOP_REUPLOAD_DAYS?`<p class="wu-remind">It’s been ${esc(count(days))} days since your last upload. Request a fresh export from WHOOP to bring in your latest days; uploading again only adds and updates, it never duplicates.</p>`:''}`;
}
export function whoopUploadPage({lastImport=null,esc=escape,icon=()=> '',now=Date.now()}={}){
 const step=(n,title,body)=>`<li class="wu-step"><span class="wu-num" aria-hidden="true">${n}</span><div><h3>${title}</h3>${body}</div></li>`;
 return `<div class="whoop-upload">
<section class="card wu-hero" aria-labelledby="wu-title"><span class="eyebrow">Integrations · WHOOP data export</span><h1 id="wu-title">Upload your WHOOP data</h1><p class="wu-lead">Free on every plan. Bring in your WHOOP history from WHOOP’s own data export: recovery, HRV, resting heart rate, sleep and its stages, strain, workouts and your journal answers.</p><div class="wu-last" id="wu-last">${lastImportHTML(lastImport,{esc,now})}</div></section>
<section class="card wu-steps" aria-labelledby="wu-steps-title"><h2 id="wu-steps-title">How to get your export</h2><ol class="wu-step-list">
${step(1,'Request your export from WHOOP','<p>On a computer, sign in to the WHOOP web app at <a href="https://app.whoop.com" target="_blank" rel="noopener noreferrer">app.whoop.com<span class="sr-only"> (opens in a new tab)</span></a> and request a data export.</p><p class="wu-alt">Or use the WHOOP phone app: tap <b>More</b>, then <b>App Settings</b>, then <b>Data Export</b> (on Android: <b>More</b>, then <b>Data Export</b>). Confirm your email address and tap <b>Create Export</b>.</p>')}
${step(2,'Open the email from WHOOP','<p>WHOOP emails you a download link, usually within minutes and always within 24 hours. <b>The link expires after 7 days</b>, so download your files soon. If it has expired, simply request a new export.</p>')}
${step(3,'Download your files','<p>You get one zip with <code>physiological_cycles.csv</code>, <code>sleeps.csv</code>, <code>workouts.csv</code> and <code>journal_entries.csv</code>. Keep it zipped or unzip it: both work.</p>')}
${step(4,'Upload them here','<p>Drop the zip, or the CSV files, in the upload box. Check the preview, then save. Upload a fresh export every week or so to stay up to date: rows you already have are updated, never duplicated.</p>')}
</ol></section>
<section class="card wu-upload" aria-labelledby="wu-upload-title"><h2 id="wu-upload-title">Your WHOOP files</h2>
<div class="wu-drop" id="wu-drop">${icon('upload')}<p class="wu-drop-copy"><b>Drop the WHOOP zip or CSV files here</b><span>You can choose several files at once.</span></p><input id="wu-files" class="wu-input sr-only" type="file" accept=".zip,.csv,application/zip,text/csv" multiple aria-describedby="wu-hint"><label class="btn" for="wu-files">Choose files</label></div>
<p class="wu-hint" id="wu-hint">Accepted: the zip WHOOP emails you, or physiological_cycles.csv, sleeps.csv, workouts.csv and journal_entries.csv. Your files are read on this device; only the measurements and journal answers shown in the preview are saved to your account.</p>
<div id="wu-status" aria-live="polite"></div><div id="wu-error" class="wu-error" role="alert"></div><div id="wu-preview"></div></section>
</div>`;
}
const TYPE_LABEL={cycles:'Cycles',sleeps:'Sleeps and naps',workouts:'Workouts',journal:'Journal answers'};
export function whoopPreviewHTML(preview,{esc=escape}={}){
 const c=preview.counts,kinds=Object.entries(preview.kinds).sort((a,b)=>b[1]-a[1]),files=preview.files;
 const range=preview.first_day?`${esc(formatDay(preview.first_day))} to ${esc(formatDay(preview.last_day))}`:'No dates found';
 return `<div class="wu-preview"><h3 id="wu-preview-title" tabindex="-1">Ready to save</h3><p class="wu-range"><span>Date range</span><b>${range}</b></p>
<dl class="wu-counts">${Object.entries(TYPE_LABEL).map(([k,label])=>`<div><dt>${label}</dt><dd>${count(c[k])}</dd></div>`).join('')}</dl>
${kinds.length?`<h4>${esc(plural(preview.measurements,'measurement'))}</h4><ul class="wu-kinds">${kinds.map(([k,n])=>`<li><span>${esc(kindName(k))}</span> <b>${count(n)}</b></li>`).join('')}</ul>`:''}
<details class="wu-files"><summary>${esc(plural(files.length,'file'))} read</summary><ul>${files.map(f=>`<li><code>${esc(f.name)}</code><span>${esc(TYPE_LABEL[f.type])} · ${esc(plural(f.rows,'row'))}</span></li>`).join('')}${(preview.skipped||[]).map(n=>`<li><code>${esc(n)}</code><span>Skipped: not a WHOOP data file</span></li>`).join('')}</ul></details>
<div class="wu-actions"><button type="button" class="btn accent" id="wu-save">Save to Xeyo</button><button type="button" class="btn light" id="wu-reset">Choose other files</button></div></div>`;
}
function progressHTML(fraction,label){const pct=Math.round(fraction*100);return `<div class="wu-progress"><div class="import-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${escape(label)}"><i style="width:${(fraction*100).toFixed(1)}%"></i></div><p>${escape(label)} ${pct}%</p></div>`}
// Wires the page. api(action,payload) is data.api; onImported(summary) runs after a successful save (refresh readings,
// connections.imports). Returns a cleanup function: call it when leaving the page to stop a read or upload in flight.
export function mountWhoopUpload(root,{api,onImported=()=>{},toast=()=>{},createWorker=()=>new Worker(new URL('./import-worker.js',import.meta.url),{type:'module'})}={}){
 const $=s=>root.querySelector(s),input=$('#wu-files'),drop=$('#wu-drop'),status=$('#wu-status'),error=$('#wu-error'),box=$('#wu-preview');
 if(!input||!drop)return ()=>{};
 let worker=null,result=null,token=0,saving=false;
 const halt=()=>{worker?.terminate();worker=null},alive=me=>me===token&&root.isConnected;
 const fail=message=>{halt();status.innerHTML='';error.textContent=message;drop.classList.remove('busy');input.disabled=false};
 function read(chosen){
  const files=[...chosen||[]];if(!files.length||saving)return;halt();const me=++token;result=null;box.innerHTML='';error.textContent='';drop.classList.add('busy');
  status.innerHTML=progressHTML(0,'Reading your files on this device…');
  try{worker=createWorker()}catch{fail('Your browser could not start reading these files. Try another browser.');return}
  worker.onmessage=({data})=>{if(!alive(me))return;if(data.progress!==undefined){status.innerHTML=progressHTML(data.progress,'Reading your files on this device…');return}
   halt();drop.classList.remove('busy');status.innerHTML='';if(data.error){fail(data.error);return}
   result=data;box.innerHTML=whoopPreviewHTML(data.preview);$('#wu-preview-title')?.focus();$('#wu-save').onclick=save;$('#wu-reset').onclick=reset};
  worker.onerror=e=>{e?.preventDefault?.();if(alive(me))fail('These files could not be read. Download a fresh export from WHOOP and try again.')};
  worker.postMessage({files,provider:'whoop'});
 }
 function reset(){if(saving)return;token++;halt();result=null;box.innerHTML='';error.textContent='';status.innerHTML='';input.value='';input.focus()}
 async function save(){
  if(!result||saving)return;saving=true;const me=token,{rows,behaviors,preview}=result,total=rows.length+behaviors.length||1,button=$('#wu-save'),other=$('#wu-reset');let saved=0,answers=0;
  button.disabled=other.disabled=input.disabled=true;error.textContent='';
  const show=()=>{status.innerHTML=progressHTML((saved+answers)/total,`Saving ${count(saved+answers)} of ${count(total)}…`)};show();
  try{
   for(let i=0;i<rows.length;i+=BATCH){const part=rows.slice(i,i+BATCH),r=await api('wearable-import',{provider:'whoop',rows:part});if(!alive(me))return;saved+=r?.imported??part.length;show()}
   for(let i=0;i<behaviors.length;i+=BATCH){const part=behaviors.slice(i,i+BATCH),r=await api('wearable-import-behaviors',{provider:'whoop',rows:part});if(!alive(me))return;answers+=r?.imported??part.length;show()}
   const files=[...new Set(preview.files.map(f=>f.name))].slice(0,20),finish=await api('wearable-import-finish',{provider:'whoop',row_count:rows.length,first_day:preview.first_day,last_day:preview.last_day,files});if(!alive(me))return;
   const summary={imported_at:finish?.imported_at||new Date().toISOString(),row_count:rows.length,first_day:preview.first_day,last_day:preview.last_day,files,behaviors:behaviors.length};
   result=null;status.innerHTML='';$('#wu-last').innerHTML=lastImportHTML(summary);
   box.innerHTML=`<div class="wu-done"><h3 id="wu-done-title" tabindex="-1">Your WHOOP data is in Xeyo</h3><p>${escape(plural(rows.length,'measurement'))}${behaviors.length?` and ${escape(plural(behaviors.length,'journal answer'))}`:''} saved, ${escape(formatDay(preview.first_day))} to ${escape(formatDay(preview.last_day))}.</p></div>`;$('#wu-done-title')?.focus();
   input.disabled=false;input.value='';toast(`${count(rows.length)} WHOOP measurements saved`);await onImported(summary);
  }catch(e){if(!alive(me))return;status.innerHTML='';error.textContent=`${e?.message||'Saving failed.'}${saved?` ${count(saved)} measurements were saved. Uploading the same files again will not duplicate them.`:''}`;button.disabled=other.disabled=input.disabled=false;button.textContent='Try again'}
  finally{saving=false}
 }
 input.addEventListener('change',()=>{read(input.files);input.value=''});
 const over=e=>{if(![...(e.dataTransfer?.types||[])].includes('Files'))return;e.preventDefault();if(!saving)drop.classList.add('over')};
 drop.addEventListener('dragenter',over);drop.addEventListener('dragover',over);
 drop.addEventListener('dragleave',e=>{if(!drop.contains(e.relatedTarget))drop.classList.remove('over')});
 drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('over');read(e.dataTransfer?.files)});
 // A file dropped beside the box would otherwise open in the tab and leave the app.
 const guard=e=>{if([...(e.dataTransfer?.types||[])].includes('Files'))e.preventDefault()};root.addEventListener('dragover',guard);root.addEventListener('drop',guard);
 return ()=>{token++;halt();root.removeEventListener('dragover',guard);root.removeEventListener('drop',guard)};
}
