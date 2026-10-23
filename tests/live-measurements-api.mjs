// Deliberate live integration check. Creates disposable accounts; prints only cleanup IDs.
import fs from 'node:fs';import assert from 'node:assert/strict';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')]}));
const base=env.VITE_SUPABASE_URL,key=env.VITE_SUPABASE_PUBLISHABLE_KEY;
async function request(path,{method='GET',token,body}={}){const r=await fetch(base+path,{method,headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json',Prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json().catch(()=>null)}}
const accounts=[];
try{
 for(let i=0;i<2;i++){const r=await request('/auth/v1/signup',{method:'POST',body:{email:'xeyo-body-qa-'+crypto.randomUUID()+'@example.com',password:crypto.randomUUID()+crypto.randomUUID()}});assert.equal(r.status,200);assert.ok(r.body.access_token);accounts.push({id:r.body.user.id,token:r.body.access_token});console.log(JSON.stringify({cleanup_user_id:r.body.user.id}));}
 const [a,b]=accounts,id=crypto.randomUUID(),rpc='/rest/v1/rpc/save_body_measurement',params={p_id:id,p_kind:'weight',p_value:72.45,p_measured_on:new Date().toISOString().slice(0,10)};
 let r=await request(rpc,{method:'POST',token:a.token,body:params});assert.equal(r.status,200,JSON.stringify(r.body));
 r=await request('/rest/v1/health_readings?select=*',{token:a.token});assert.equal(r.body.length,1);assert.equal(r.body[0].value,72.45);assert.equal(r.body[0].source,'Manual entry');assert.equal(r.body[0].user_id,a.id);
 r=await request(rpc,{method:'POST',token:a.token,body:{...params,p_value:73.2}});assert.equal(r.status,200);
 r=await request('/rest/v1/health_readings?select=value',{token:a.token});assert.deepEqual(r.body,[{value:73.2}]);
 r=await request('/rest/v1/health_readings?select=id',{token:b.token});assert.deepEqual(r.body,[]);
 r=await request(rpc,{method:'POST',token:b.token,body:{...params,p_value:90}});assert.equal(r.status,403);
 r=await request(rpc,{method:'POST',token:a.token,body:{...params,p_kind:'hrv'}});assert.equal(r.status,400);
 r=await request('/rest/v1/health_readings?id=eq.'+id,{method:'PATCH',token:a.token,body:{value:99}});assert.equal(r.status,403);
 r=await request(rpc,{method:'POST',body:params});assert.ok([401,403].includes(r.status));
 r=await request('/rest/v1/rpc/remove_body_measurement',{method:'POST',token:b.token,body:{p_id:id}});assert.equal(r.status,403);
 r=await request('/rest/v1/rpc/remove_body_measurement',{method:'POST',token:a.token,body:{p_id:id}});assert.equal(r.status,204);
 r=await request('/rest/v1/health_readings?select=id',{token:a.token});assert.deepEqual(r.body,[]);
 console.log('PASS: live create, persisted precision, idempotent edit, read isolation, cross-account write/delete denial, provider-kind rejection, anonymous denial, and deletion.');
}finally{for(const a of accounts)await request('/auth/v1/logout',{method:'POST',token:a.token})}
