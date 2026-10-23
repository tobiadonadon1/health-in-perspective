import {askProvider,summarizeReadings,providers} from './chat.mjs';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const checked=r=>{if(r.error)throw Error('Could not read your private journal. Please try again.');return r.data;};
export function journalContext(rows,now=Date.now()){
 const valid=rows.filter(r=>r.value!=null&&Number.isFinite(Number(r.value))&&Date.parse(r.observed_at)<=now&&Date.parse(r.observed_at)>=now-30*86400000);
 return summarizeReadings(valid,now).map(mean=>{
  const group=valid.filter(r=>r.kind===mean.metric&&r.unit===mean.unit&&r.source===mean.source).sort((a,b)=>Date.parse(b.observed_at)-Date.parse(a.observed_at));
  const recent=summarizeReadings(group.filter(r=>Date.parse(r.observed_at)>=now-7*86400000),now)[0];
  return {...mean,period_days:30,recent_7_day_mean:recent?.mean??null,recent_recorded_days:recent?.recorded_days??0,latest:{value:Number(group[0].value),observed_at:group[0].observed_at}};
 });
}
export async function handleJournal(payload,{client,userId,unseal,fetcher=fetch}){
 if(payload.action!=='journal-reflect'||!uuid(payload.entry_id))throw Error('Choose a saved journal entry.');
 const entry=checked(await client.from('journal_entries').select('id,content,logged_on').eq('user_id',userId).eq('id',payload.entry_id).maybeSingle());
 if(!entry)throw Error('This journal entry is unavailable.');
 const c=checked(await client.from('chat_connections').select('provider,model,encrypted_key').eq('user_id',userId).maybeSingle());
 let connection=c;
 if(!connection){const ai=checked(await client.from('ai_credentials').select('encrypted_key').eq('user_id',userId).maybeSingle());if(ai)connection={provider:'openai',model:providers.openai.model,encrypted_key:ai.encrypted_key};}
 if(!connection)throw Error('Your note is saved. Connect your AI in Chatbot to add a reflection.');
 const previous=checked(await client.from('journal_reflections').select('*').eq('entry_id',entry.id).eq('user_id',userId).maybeSingle());
 if(previous?.status==='ready')return {reflection:previous};
 if(previous?.status==='processing'&&Date.parse(previous.updated_at)>Date.now()-180000)throw Error('A reflection is already being prepared. Check back shortly.');
 const {provider,model}=connection;
 const job={entry_id:entry.id,user_id:userId,entry_content:entry.content,provider,model,context_shared:payload.include_context===true,status:'processing',content:'',error:null,updated_at:new Date().toISOString()};
 let started;
 if(previous){started=await client.from('journal_reflections').update(job).eq('id',previous.id).eq('updated_at',previous.updated_at).select('id').maybeSingle();}
 else started=await client.from('journal_reflections').insert(job).select('id').single();
 if(started.error||!started.data)throw Error('A reflection is already being prepared, or the note changed. Refresh your journal.');
 const id=started.data.id;
 try{
  let context=null;
  if(job.context_shared){let rows=[];for(let offset=0;offset<10000;offset+=1000){const r=checked(await client.from('health_readings').select('kind,value,unit,source,observed_at').eq('user_id',userId).gte('observed_at',new Date(Date.now()-30*86400000).toISOString()).order('observed_at',{ascending:false}).order('id').range(offset,offset+999));rows.push(...r);if(r.length<1000)break;}context=journalContext(rows);}
  const content=await askProvider({provider,model,key:(await unseal(connection.encrypted_key)).key,purpose:'journal',messages:[{role:'user',content:`Journal date: ${entry.logged_on}\nMy note: ${entry.content}`}],context},fetcher);
  const result=await client.from('journal_reflections').update({status:'ready',content,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',userId).select('*').maybeSingle();
  if(result.error||!result.data)throw Error('Your note changed while the reflection was being prepared. Request a new reflection for the current note.');
  return {reflection:result.data};
 }catch(e){await client.from('journal_reflections').update({status:'failed',error:e.message,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',userId);throw e;}
}
