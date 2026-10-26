import {createProfileSaver} from './profile/persistence.js';
import {validateMeasurement} from './body-measurements.js';
import {createClient} from '@supabase/supabase-js';
import {validateMeal,validateUpload,validateLabResult,localDay} from './domain.js';
import {prepareImage} from './image-prep.js';
export const configured=!!(import.meta.env.VITE_SUPABASE_URL&&import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
export const storageReady=import.meta.env.VITE_STORAGE_READY === 'true';
export const emailConfirmation=import.meta.env.VITE_EMAIL_CONFIRMATION !== 'false';
export const testMode=import.meta.env.VITE_AUTH_AUDIENCE !== 'public';
export const db=configured?createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY):null;
export let user=null;
export async function session(){if(!db)return null;const {data,error}=await db.auth.getSession();if(error)throw error;user=data.session?.user||null;return user}
export async function signOut(){if(db){const {error}=await db.auth.signOut();if(error)throw error}user=null}
export async function meals(day=localDay()){const {data,error}=await db.from('meals').select('*').eq('logged_on',day).order('created_at',{ascending:false});if(error)throw error;return data}
export async function saveMeal(m){m=validateMeal(m);const row={name:m.name,calories:m.calories,protein:m.protein,carbs:m.carbs,fat:m.fat,source:m.source||'Nutrition label',meal_type:m.meal_type||'Snack',logged_on:m.logged_on||localDay()};const {error}=await db.from('meals').insert({...row,user_id:user.id});if(error)throw error}
export async function removeMeal(id){const {error}=await db.from('meals').delete().eq('id',id);if(error)throw error}
export async function saveMeals(items){if(!Array.isArray(items)||!items.length||items.length>20)throw Error('Save between 1 and 20 foods at a time.');const rows=items.map(validateMeal).map(m=>({id:crypto.randomUUID(),user_id:user.id,name:m.name,calories:m.calories,protein:m.protein,carbs:m.carbs,fat:m.fat,source:m.source||'Nutrition facts',meal_type:m.meal_type||'Snack',logged_on:m.logged_on||localDay()}));const {data:inserted,error}=await db.from('meals').insert(rows).select();if(error)throw error;return rows.map(row=>inserted.find(r=>r.id===row.id))}
export async function readings(){let rows=[];for(let offset=0;offset<10000;offset+=1000){const {data,error}=await db.from('health_readings').select('*').or(`observed_at.gte.${new Date(Date.now()-366*86400000).toISOString()},source.eq."Manual entry"`).order('observed_at',{ascending:false}).order('id').range(offset,offset+999);if(error)throw error;rows.push(...data);if(data.length<1000)break}return rows}
export async function saveDashboard(kinds){const r=await db.auth.updateUser({data:{dashboard:kinds}});if(r.error)throw r.error;user=r.data.user;}
export async function records(){const {data,error}=await db.from('records').select('*').order('created_at',{ascending:false});if(error)throw error;return data}
export async function labResults(){const {data,error}=await db.from('lab_results').select('*').order('collected_on',{ascending:false});if(error)throw error;return data}
export async function saveLabResult(input,id){const row=validateLabResult(input);const result=id?await db.from('lab_results').update(row).eq('id',id):await db.from('lab_results').insert({...row,user_id:user.id});if(result.error)throw result.error}
export async function removeLabResult(id){const {error}=await db.from('lab_results').delete().eq('id',id);if(error)throw error}
export async function uploadRecord(file,kind='lab'){if(!storageReady)throw Error('Private uploads are temporarily unavailable. Please try again later.');if(kind==='photo')file=await prepareImage(file);validateUpload(file);const extension={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];const path=`${user.id}/${crypto.randomUUID()}.${extension}`;const {error}=await db.storage.from('health-records').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;const r=await db.from('records').insert({user_id:user.id,name:file.name,path,kind,mime:file.type}).select('id').single();if(r.error){await db.storage.from('health-records').remove([path]);throw r.error}return r.data.id}
export async function downloadRecord(id){const {data,error}=await db.from('records').select('path').eq('id',id).single();if(error)throw error;const result=await db.storage.from('health-records').createSignedUrl(data.path,60);if(result.error)throw result.error;return result.data.signedUrl}
export async function deleteRecord(id){const {data,error}=await db.from('records').select('path,kind').eq('id',id).single();if(error)throw error;if(data.kind==='photo')await api('portrait-delete',{sourceId:id});const r=await db.storage.from('health-records').remove([data.path]);if(r.error)throw r.error;const d=await db.from('records').delete().eq('id',id);if(d.error)throw d.error}
export async function api(action,payload={}){if(!db||!user)throw Error('Sign in to continue.');const {data,error}=await db.functions.invoke('health-api',{body:{action,...payload}});if(error){let message;try{message=(await error.context?.json())?.error}catch{}throw Error(message||'The connected service is unavailable. Please try again.')}if(data?.error)throw Error(data.error);return data}
export async function exportAll(){const result={exported_at:new Date().toISOString(),email:user.email};for(const table of ['meals','health_readings','lab_results','records','chat_messages','portrait_renders','journal_entries','journal_reflections']){let rows=[],offset=0;while(true){const {data,error}=await db.from(table).select('*').order('id').range(offset,offset+499);if(error)throw error;rows.push(...data);if(data.length<500)break;offset+=500}result[table]=rows}result.profile=await profile();return result}

export async function removeMeals(ids){const {error}=await db.from('meals').delete().in('id',ids);if(error)throw error}
export async function updateMeals(items){const rows=items.map(validateMeal).map(m=>({id:m.id,user_id:user.id,name:m.name,calories:m.calories,protein:m.protein,carbs:m.carbs,fat:m.fat,meal_type:m.meal_type,logged_on:m.logged_on,source:m.source}));const {error}=await db.from('meals').upsert(rows);if(error)throw error}

export async function profile(){const {data,error}=await db.from('profiles').select('*').eq('user_id',user.id).maybeSingle();if(error)throw error;return data}
export const saveProfile=createProfileSaver({db,getUser:()=>user,uploadRecord});
export async function profilePhoto(profile){if(!profile?.photo_record_id||profile.representation!=='photo')return null;const {data:row,error}=await db.from('portrait_renders').select('output_path').eq('user_id',user.id).eq('source_record_id',profile.photo_record_id).eq('status','ready').not('accepted_at','is',null).order('accepted_at',{ascending:false}).limit(1).maybeSingle();if(error)throw error;if(!row)return null;const r=await db.storage.from('portrait-renders').createSignedUrl(row.output_path,3600);if(r.error)throw r.error;return r.data.signedUrl}

export async function peerPercentiles(){const {data,error}=await db.rpc('peer_percentiles');if(error)throw error;return data}
export async function chatMessages({provider,model}){const {data,error}=await db.from('chat_messages').select('id,role,content,provider,model,context_shared,created_at').eq('provider',provider).eq('model',model).order('created_at',{ascending:false}).limit(100);if(error)throw error;return data.reverse()}

export async function saveDashboardLayout(layout){const r=await db.auth.updateUser({data:{dashboard_layout:layout}});if(r.error)throw r.error;user=r.data.user;}

export async function journalEntries(){const {data,error}=await db.from('journal_entries').select('*,journal_reflections(*)').order('logged_on',{ascending:false}).order('created_at',{ascending:false}).limit(100);if(error)throw error;return data}
export async function saveJournal({id,content,logged_on}){content=String(content||'').trim();if(!content||content.length>4000)throw Error('Write a note of 1–4,000 characters.');if(!/^\d{4}-\d{2}-\d{2}$/.test(logged_on)||logged_on>localDay())throw Error('Choose today or an earlier date.');const row={content,logged_on};const result=id?await db.from('journal_entries').update(row).eq('id',id).select().single():await db.from('journal_entries').insert({...row,user_id:user.id}).select().single();if(result.error)throw result.error;return result.data}
export async function deleteJournal(id){const {error}=await db.from('journal_entries').delete().eq('id',id);if(error)throw error}
export async function deleteReflection(id){const {error}=await db.from('journal_reflections').delete().eq('entry_id',id);if(error)throw error}
export async function saveBodyMeasurement(input){const m=validateMeasurement(input);const {data,error}=await db.rpc('save_body_measurement',{p_id:m.id,p_kind:m.kind,p_value:m.value,p_measured_on:m.measured_on});if(error)throw error;return data}
export async function removeBodyMeasurement(id){const {error}=await db.rpc('remove_body_measurement',{p_id:id});if(error)throw error}
