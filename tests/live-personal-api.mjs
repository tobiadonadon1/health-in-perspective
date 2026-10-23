// Disposable real-API checks. Run deliberately; no passwords/tokens are printed or persisted.
import fs from 'node:fs';import assert from 'node:assert/strict';
const values=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const p=l.indexOf('=');return [l.slice(0,p),l.slice(p+1).replace(/^['"]|['"]$/g,'')]}));
const base=values.VITE_SUPABASE_URL,key=values.VITE_SUPABASE_PUBLISHABLE_KEY;let uid;
async function request(path,{method='GET',body,token}={}){const r=await fetch(base+path,{method,headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json',Origin:'https://xeyo.ai',Prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json().catch(()=>null)}}
try{
 const email='xeyo-qa-'+crypto.randomUUID()+'@example.com';const signup=await request('/auth/v1/signup',{method:'POST',body:{email,password:crypto.randomUUID()+crypto.randomUUID()}});
 assert.equal(signup.status,200);const token=signup.body.access_token;assert.ok(token,'Signup must return a session without email confirmation');uid=signup.body.user.id;console.log(JSON.stringify({cleanup_user_id:uid}));
 let r=await request('/rest/v1/profiles',{method:'POST',token,body:{user_id:uid,representation:'stats',gender:'unspecified',age:28,peer_opt_in:false}});assert.equal(r.status,201);
 r=await request('/rest/v1/profiles?select=representation,age,peer_opt_in',{token});assert.equal(r.status,200);assert.deepEqual(r.body,[{representation:'stats',age:28,peer_opt_in:false}]);
 r=await request('/rest/v1/rpc/peer_percentiles',{method:'POST',token,body:{}});assert.equal(r.status,200);assert.equal(r.body.status,'opt_in_required');
 r=await request('/functions/v1/health-api',{method:'POST',token,body:{action:'chat-status'}});assert.equal(r.status,200);assert.equal(r.body.connection,null);
 r=await request('/functions/v1/health-api',{method:'POST',token,body:{action:'chat-send',request_id:crypto.randomUUID(),message:'QA connectivity check'}});assert.equal(r.status,400);assert.match(r.body.error,/Connect your own AI API key/);
 r=await request('/rest/v1/chat_connections?select=*',{token});assert.equal(r.status,403);
 r=await request('/rest/v1/chat_messages?select=id',{token});assert.equal(r.status,200);assert.equal(r.body.length,0);
 r=await request('/rest/v1/profiles?user_id=eq.'+uid,{method:'PATCH',token,body:{peer_opt_in:true}});assert.equal(r.status,200);
 r=await request('/rest/v1/rpc/peer_percentiles',{method:'POST',token,body:{}});assert.equal(r.status,200);assert.equal(r.body.status,'ok');assert.equal(r.body.metrics.length,0);
 r=await request('/rest/v1/rpc/peer_percentiles',{method:'POST',body:{}});assert.ok([401,403].includes(r.status));
 r=await request('/functions/v1/health-api',{method:'POST',body:{action:'chat-status'}});assert.equal(r.status,401);
 const layout={version:1,widgets:[{id:'hrv',size:'large'},{id:'nutrition',size:'medium'}]};
 r=await request('/auth/v1/user',{method:'PUT',token,body:{data:{dashboard_layout:layout}}});assert.equal(r.status,200);
 r=await request('/auth/v1/user',{token});assert.deepEqual(r.body.user_metadata.dashboard_layout,layout);
 const referenceId=crypto.randomUUID();r=await request('/rest/v1/records',{method:'POST',token,body:{id:referenceId,user_id:uid,name:'QA reference metadata only',path:uid+'/qa-reference.png',kind:'photo',mime:'image/png'}});assert.equal(r.status,201);
 r=await request('/functions/v1/health-api',{method:'POST',token,body:{action:'portrait-status',sourceId:referenceId}});assert.equal(r.status,200);assert.equal(r.body.connected,false);assert.equal(r.body.job,null);
 r=await request('/functions/v1/health-api',{method:'POST',token,body:{action:'portrait-start',sourceId:referenceId,consent:true}});assert.equal(r.status,400);assert.match(r.body.error,/Connect your own OpenAI API key/);
 r=await request('/functions/v1/health-api',{method:'POST',token,body:{action:'portrait-status',sourceId:crypto.randomUUID()}});assert.equal(r.status,400);assert.match(r.body.error,/unavailable/);
 r=await request('/rest/v1/portrait_renders',{method:'POST',token,body:{user_id:uid,source_record_id:referenceId,status:'processing'}});assert.equal(r.status,403);
 r=await request('/rest/v1/rpc/claim_whoop_sync',{method:'POST',token,body:{owner:uid}});assert.equal(r.status,403);
 r=await request('/functions/v1/health-api',{method:'POST',token,body:{action:'whoop-sync'}});assert.equal(r.status,400);

 const note=crypto.randomUUID();
 r=await request('/rest/v1/journal_entries',{method:'POST',token,body:{id:note,user_id:uid,content:'Disposable integration test note',logged_on:'2026-10-23'}});assert.equal(r.status,201);
 r=await request('/rest/v1/journal_entries?select=*,journal_reflections(*)',{token});assert.equal(r.status,200);assert.equal(r.body[0].content,'Disposable integration test note');
 r=await request('/functions/v1/health-api',{method:'POST',token,body:{action:'journal-reflect',entry_id:note,include_context:true}});assert.equal(r.status,400);assert.match(r.body.error,/note is saved/);
 r=await request('/rest/v1/journal_entries?id=eq.'+note,{method:'PATCH',token,body:{content:'Edited integration test note'}});assert.equal(r.status,200);assert.equal(r.body[0].content,'Edited integration test note');
 r=await request('/rest/v1/journal_reflections',{method:'POST',token,body:{entry_id:note,user_id:uid,entry_content:'Edited integration test note',provider:'openai',model:'test'}});assert.equal(r.status,403);
 r=await request('/rest/v1/journal_entries?id=eq.'+note,{method:'DELETE',token});assert.equal(r.status,200);
 r=await request('/rest/v1/journal_entries?select=id',{token});assert.equal(r.body.length,0);
 console.log('PASS: real journal create, load, edit, delete, missing-key recovery and forged-reflection rejection.');
 console.log('PASS: real widget preference persistence, private portrait status, missing-key handling, inaccessible photo denial, render write denial and sync lease isolation.');
 await request('/auth/v1/logout',{method:'POST',token});console.log('PASS: real signup, persisted profile, cohort opt-in, private chat permissions, authenticated API and missing-key error.');
}catch(e){console.error('FAIL:',e.message);process.exitCode=1}
