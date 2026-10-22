import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmailFlow, emailRateLimit, authMessage } from '../src/auth-flow.js';
const storage = () => { const m = new Map(); return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),values:()=>[...m.values()]}; };

test('signup moves to verification, stores no password, and duplicate submits do not send email', async () => {
  const saved=storage(); let calls=0; let time=1000;
  const flow=createEmailFlow({signUp:async p=>{calls++;assert.equal(p.options.emailRedirectTo,'https://app.test/');return {data:{session:null},error:null};}},saved,()=>time);
  const request={email:' A@example.com ',signup:{name:' A ',password:'secret-password'},origin:'https://app.test'};
  const first=await flow.send(request);assert.equal(first.pending.email,'a@example.com');assert.equal(first.pending.type,'signup');assert.equal(first.pending.delivery,'requested');
  assert.equal((await flow.send(request)).limited,true);assert.equal(calls,1);assert.ok(!saved.values().join('').includes('secret-password'));
  time+=17000;const reloaded=createEmailFlow({},saved,()=>time);assert.equal(reloaded.waitSeconds('A@example.com','signup'),43);
});
test('server countdown is respected and resend uses resend endpoint, not signup', async () => {
  let time=1000,calls=0;const flow=createEmailFlow({resend:async p=>{calls++;assert.equal(p.type,'signup');return calls===1?{error:{code:'over_email_send_rate_limit',message:'For security purposes, you can only request this after 43 seconds.'}}:{data:{user:null,session:null},error:null};}},storage(),()=>time);
  const request={email:'a@example.com',origin:'https://app.test'};
  const first=await flow.send(request);assert.equal(first.remaining,43);assert.equal(first.pending.delivery,'unconfirmed');
  assert.equal((await flow.send(request)).limited,true);assert.equal(calls,1);time+=43000;assert.equal((await flow.send(request)).limited,false);assert.equal(calls,2);
});
test('hourly limits do not encourage one-minute retry loops',()=>assert.equal(emailRateLimit({code:'over_email_send_rate_limit',message:'Email rate limit exceeded'}),3600));
test('recovery has its own redirect and state, and bad storage is discarded',async()=>{
  let called=false;const saved=storage();saved.setItem('health-email-flow-v1','invalid json');
  const flow=createEmailFlow({resetPasswordForEmail:async(email,options)=>{called=true;assert.equal(options.redirectTo,'https://app.test/?reset=1');return {data:{},error:null};}},saved,()=>1000);
  assert.equal(flow.get(),null);const result=await flow.send({email:'a@example.com',type:'recovery',origin:'https://app.test'});assert.equal(result.pending.type,'recovery');assert.equal(called,true);flow.clear();assert.equal(flow.get(),null);assert.deepEqual(saved.values(),[]);
});
test('concurrent signup is deduplicated and delivery failure is not reported as sent',async()=>{
  let finish,calls=0;const flow=createEmailFlow({signUp:()=>{calls++;return new Promise(resolve=>finish=resolve);}},storage());
  const request={email:'a@example.com',signup:{name:'A',password:'secret'},origin:'https://app.test'};
  const a=flow.send(request);await flow.send(request);assert.equal(calls,1);finish({error:{code:'email_address_not_authorized',message:'not authorized'}});await assert.rejects(a);assert.equal(flow.get(),null);assert.match(authMessage({code:'email_address_not_authorized'}),/not enabled/);
});
