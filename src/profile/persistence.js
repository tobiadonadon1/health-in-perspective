import {validateProfile} from './domain.js';
import {localDay} from '../domain.js';

const interrupted = error => /failed to fetch|fetch failed|network|load failed|abort|timeout/i.test(error?.message || '');

// Retry only the idempotent profile upsert. Never replay an arbitrary upload or insert.
export function createProfileSaver({db,getUser,uploadRecord,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),timeoutMs=12000}){
 const uploaded=new WeakMap();
 return async function saveProfile(input,file){
  const owner=getUser()?.id;
  if(!owner)throw Error('Your session has ended. Sign in again to finish setup.');
  const row={...validateProfile(input),user_id:owner,age_updated_on:localDay()};
  if(file){
   try{
    const cached=uploaded.get(file);
    row.photo_record_id=cached?.owner===owner?cached.id:await uploadRecord(file,'photo');
    uploaded.set(file,{owner,id:row.photo_record_id});
   }catch(cause){
    const error=new Error(interrupted(cause)?'Your photo could not upload because the connection was interrupted. Retry, or continue without the photo and add it in Profile.':cause.message);
    error.code='PHOTO_UPLOAD_FAILED';throw error;
   }
  }
  for(let attempt=0;attempt<3;attempt++){
   if(getUser()?.id!==owner)throw Error('Your session has changed. Sign in again to finish setup.');
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
   let result;
   try{
    result=await db.from('profiles').upsert(row,{onConflict:'user_id'}).select('*').single().abortSignal(controller.signal);
   }catch(error){result={error,status:interrupted(error)?0:undefined};}
   finally{clearTimeout(timer);}
   if(!result.error)return result.data;
   const transient=result.status===0||[408,502,503,504].includes(result.status)||interrupted(result.error);
   if(transient&&attempt<2){await wait(500*(attempt+1));continue;}
   if(transient)throw Error('We couldn’t reach Xeyo to confirm your preferences. Your choices are still here. Check your connection and try again.');
   if(result.status===401)throw Error('Your session has expired. Sign in again to finish setup.');
   throw new Error(result.error.message||'Your preferences could not be saved. Please try again.',{cause:result.error});
  }
 };
}

// A failed workspace transition must not repeat an already confirmed save/upload.
export function createOnboardingSubmitter({save,done}){
 let saved=null;
 return async(input,file)=>{
  const key=JSON.stringify(input);
  if(!saved||saved.key!==key||saved.file!==file)saved={key,file,profile:await save(input,file)};
  await done(saved.profile);
 };
}
