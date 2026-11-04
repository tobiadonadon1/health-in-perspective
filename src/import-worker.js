import {strFromU8} from 'fflate';
import {createCollector,createAppleParser,parseFitbit,readWhoopUploads} from './wearable-import.js';
import {zipEntries,readEntry} from './zip-reader.js';
// Exports are streamed: an Apple Watch archive of several GB never has to fit in memory. Every daily row is kept (whole
// history, no cap): the page uploads them in batches of 2,000.
const MAX_FITBIT_FILE=200*1024*1024,MAX_FITBIT_TOTAL=1536*1024*1024;
async function streamFile(file,onChunk,onProgress){const reader=file.stream().getReader();let read=0;while(true){const {done,value}=await reader.read();if(done)break;read+=value.length;onChunk(value);onProgress(read/(file.size||1))}}
self.onmessage=async({data})=>{try{
 const {files,provider,weightUnit}=data,collector=createCollector(),total=files.reduce((s,f)=>s+f.size,0)||1;let done=0,matched=0,last=0;
 // WHOOP: the whole history, uncapped, with a preview (counts per file type and measurement, date range) for the upload page.
 if(provider==='whoop'){self.postMessage(await readWhoopUploads(files,{onProgress:v=>{if(v-last>=.01||v===1){last=v;self.postMessage({progress:v})}}}));return}
 const progress=(file,fraction)=>{const value=Math.min(1,(done+file.size*fraction)/total);if(value-last>=.01||value===1){last=value;self.postMessage({progress:value})}};
 for(const file of files){
  const zip=file.name.toLowerCase().endsWith('.zip');
  if(provider==='apple'){
   const parser=createAppleParser(collector),decoder=new TextDecoder(),feed=bytes=>parser.push(decoder.decode(bytes,{stream:true}));
   if(zip){const entries=(await zipEntries(file)).filter(e=>/(^|\/)export\.xml$/i.test(e.name)&&!/__MACOSX/.test(e.name));if(!entries.length)throw Error('This archive has no export.xml. Choose the export.zip from the iPhone Health app.');await readEntry(file,entries[0],feed,f=>progress(file,f));}
   else if(/\.xml$/i.test(file.name))await streamFile(file,feed,f=>progress(file,f));
   else throw Error('Choose export.zip or export.xml from the iPhone Health app.');
   parser.push(decoder.decode());parser.end();matched++;
  }else{
   const entries=zip?(await zipEntries(file)).filter(e=>/\.(json|csv)$/i.test(e.name)&&!/__MACOSX/.test(e.name)):[{name:file.name,size:file.size}];
   let index=0,extracted=0;for(const entry of entries){
    if(entry.size>MAX_FITBIT_FILE)continue;extracted+=entry.size;if(extracted>MAX_FITBIT_TOTAL)throw Error('This archive is very large. Choose the heart-rate, sleep, HRV, weight or body-fat files individually.');
    let bytes;if(zip){const parts=[];let length=0;await readEntry(file,entry,c=>{parts.push(c);length+=c.length});bytes=new Uint8Array(length);let o=0;for(const p of parts){bytes.set(p,o);o+=p.length}}else bytes=new Uint8Array(await file.arrayBuffer());
    if(/\.(json|csv)$/i.test(entry.name)){try{parseFitbit(strFromU8(bytes),entry.name,collector,{weightUnit});matched++}catch(e){if(/units/.test(e.message))throw e}}
    progress(file,++index/entries.length);
   }
  }
  done+=file.size;progress(file,0);
 }
 const result=collector.result();
 if(!matched||!result.rows.length)throw Error(provider==='apple'?'No supported measurements were found in this Apple Health export.':'No supported measurements were found. Select a Fitbit/Google Health archive, or heart-rate, sleep, HRV, body-fat or weight JSON/CSV files.');
 self.postMessage(result);
}catch(e){self.postMessage({error:e?.message||'This export could not be read.'})}};
