import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {createProfileSaver,createOnboardingSubmitter} from '../src/profile/persistence.js';

const input={representation:'photo',gender:'woman',age:29,peer_opt_in:false};
const owner={id:'10000000-0000-4000-8000-000000000001'};
function harness(handler,options={}){
 const requests=[];
 const db=createClient('https://example.supabase.co','test-publishable-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,init)=>{
  requests.push({url,body:JSON.parse(init.body),headers:new Headers(init.headers)});
  return handler(requests.length,requests.at(-1));
 }}});
 return {requests,save:createProfileSaver({db,getUser:()=>owner,uploadRecord:async()=> 'photo-id',wait:async()=>{},...options})};
}
const ok=row=>new Response(JSON.stringify(row),{status:200,headers:{'Content-Type':'application/json'}});

test('lost response after commit retries the same profile, with comparisons still off',async()=>{
 let stored;
 const {save,requests}=harness((attempt,request)=>{stored={...request.body};if(attempt===1)throw new TypeError('Failed to fetch');return ok(stored)});
 const row=await save(input);
 assert.equal(requests.length,2);assert.deepEqual(requests[0].body,requests[1].body);
 assert.match(requests[0].url,/on_conflict=user_id/);
 assert.match(requests[0].headers.get('prefer'),/resolution=merge-duplicates/);
 assert.equal(row.peer_opt_in,false);assert.equal(row.user_id,owner.id);
});
test('persistent network failure is bounded and manual retry reuses the uploaded photo',async()=>{
 let online=false,uploads=0;
 const {save,requests}=harness((_,request)=>{if(!online)throw new TypeError('Failed to fetch');return ok(request.body)}, {uploadRecord:async()=>{uploads++;return 'same-photo'}});
 const file=new Blob(['photo']);
 await assert.rejects(save(input,file),/choices are still here/);
 assert.equal(requests.length,3);online=true;
 assert.equal((await save(input,file)).photo_record_id,'same-photo');assert.equal(uploads,1);
});
test('permission errors are not retried or reported as a successful save',async()=>{
 const {save,requests}=harness(()=>new Response(JSON.stringify({message:'Permission denied',code:'42501'}),{status:403}));
 await assert.rejects(save(input),/Permission denied/);assert.equal(requests.length,1);
});
test('photo failure can be explicitly skipped without changing other choices',async()=>{
 const {save,requests}=harness((_,request)=>ok(request.body),{uploadRecord:async()=>{throw new TypeError('Failed to fetch')}});
 await assert.rejects(save(input,new Blob(['photo'])),e=>e.code==='PHOTO_UPLOAD_FAILED');
 assert.equal(requests.length,0);
 const row=await save(input,null);assert.equal(row.photo_record_id,null);assert.equal(row.peer_opt_in,false);assert.equal(row.representation,'photo');
});
test('changing the signed-in account during recovery stops the write',async()=>{
 let current=owner;
 const {save,requests}=harness(()=>{throw new TypeError('Failed to fetch')},{getUser:()=>current,wait:async()=>{current={id:'another-user'}}});
 await assert.rejects(save(input),/session has changed/);assert.equal(requests.length,1);
});
test('a failed workspace transition does not repeat a confirmed save',async()=>{
 let saves=0,opens=0;
 const submit=createOnboardingSubmitter({save:async value=>{saves++;return {...value,user_id:owner.id}},done:async row=>{assert.equal(row.user_id,owner.id);if(++opens===1)throw Error('Workspace unavailable')}});
 await assert.rejects(submit(input,null),/Workspace unavailable/);await submit(input,null);
 assert.equal(saves,1);assert.equal(opens,2);
 await submit({...input,peer_opt_in:true},null);assert.equal(saves,2);
});
