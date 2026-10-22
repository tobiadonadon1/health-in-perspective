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
 await request('/auth/v1/logout',{method:'POST',token});console.log('PASS: real signup, persisted profile, cohort opt-in, private chat permissions, authenticated API and missing-key error.');
}catch(e){console.error('FAIL:',e.message);process.exitCode=1}
