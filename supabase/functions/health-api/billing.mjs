// Stripe billing for Xeyo Pro (EUR 5/month), using the existing Stripe Payment Link and product.
// Checkout carries the member's id as client_reference_id; Stripe's webhooks keep public.subscriptions current.
export const DEFAULT_PAYMENT_LINK='https://buy.stripe.com/4gMeVcevV71hce2g0j0RG04';
export const DEFAULT_PRO_PRODUCT='prod_VYwqqND3EY7S3r';
const STATUSES=['active','trialing','past_due','canceled','unpaid','incomplete','incomplete_expired','paused'];
const enc=new TextEncoder();
const hex=buf=>Array.from(new Uint8Array(buf),b=>b.toString(16).padStart(2,'0')).join('');
function safeEqual(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}

export function checkoutUrl({paymentLink=DEFAULT_PAYMENT_LINK,userId,email}){
 const u=new URL(paymentLink);if(u.protocol!=='https:'||!/(^|\.)stripe\.com$/.test(u.hostname))throw Error('Checkout is not configured.');
 if(userId)u.searchParams.set('client_reference_id',userId);if(email)u.searchParams.set('prefilled_email',email);return u.toString();
}

// Stripe-Signature: t=<unix>,v1=<hex hmac-sha256 of "<t>.<raw body>">. Rejects stale events (replay protection).
export async function verifyStripeSignature(rawBody,header,secret,{now=Date.now(),tolerance=300}={}){
 if(!secret)throw Error('Stripe webhook secret is not configured.');
 const parts=String(header||'').split(',').map(p=>p.trim().split('=')),t=parts.find(([k])=>k==='t')?.[1],sigs=parts.filter(([k])=>k==='v1').map(([,v])=>v);
 if(!t||!/^\d+$/.test(t)||!sigs.length)throw Error('Missing Stripe signature.');
 if(Math.abs(now/1000-Number(t))>tolerance)throw Error('Stripe signature is too old.');
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const expected=hex(await crypto.subtle.sign('HMAC',key,enc.encode(`${t}.${rawBody}`)));
 if(!sigs.some(s=>safeEqual(s,expected)))throw Error('Invalid Stripe signature.');
 return JSON.parse(rawBody);
}
export async function signStripePayload(rawBody,secret,t=Math.floor(Date.now()/1000)){ // for tests and local runs
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return `t=${t},v1=${hex(await crypto.subtle.sign('HMAC',key,enc.encode(`${t}.${rawBody}`)))}`;
}

// Since Stripe API 2025-03-31 the billing period lives on the subscription items; older versions keep it on the subscription.
export function subscriptionRow(sub){
 const item=sub.items?.data?.[0],end=sub.current_period_end??item?.current_period_end;
 return {stripe_subscription_id:String(sub.id),stripe_customer_id:typeof sub.customer==='string'?sub.customer:sub.customer?.id||null,
  status:STATUSES.includes(sub.status)?sub.status:'incomplete',price_id:item?.price?.id||null,
  current_period_end:Number.isFinite(end)?new Date(end*1000).toISOString():null,cancel_at_period_end:!!sub.cancel_at_period_end,updated_at:new Date().toISOString()};
}
const productOf=sub=>{const p=sub.items?.data?.[0]?.price?.product;return typeof p==='string'?p:p?.id||null};
async function stripeGet(path,{secretKey,fetcher=fetch,apiBase='https://api.stripe.com'}){
 const r=await fetcher(apiBase+'/v1/'+path,{headers:{Authorization:'Bearer '+secretKey},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Stripe did not return the subscription.');return r.json();
}
export async function stripePortal({secretKey,customer,returnUrl,fetcher=fetch,apiBase='https://api.stripe.com'}){
 const r=await fetcher(apiBase+'/v1/billing_portal/sessions',{method:'POST',headers:{Authorization:'Bearer '+secretKey,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({customer,return_url:returnUrl}),signal:AbortSignal.timeout(15000)});
 const j=await r.json().catch(()=>({}));if(!r.ok||!j.url)throw Error('The billing portal is unavailable. Try again later.');return j.url;
}

// Applies one verified Stripe event. Returns the member ids whose plan may have changed, so the caller can
// enforce a lapse (disconnect WHOOP, free the seat). Unrelated products and event types are ignored.
export async function applyStripeEvent(event,{client,secretKey,product=DEFAULT_PRO_PRODUCT,fetcher=fetch,apiBase}){
 const type=event?.type,obj=event?.data?.object;if(!type||!obj)return {ignored:true,users:[]};
 const users=new Set();
 const save=async(row,userId,email)=>{
  const existing=await client.from('subscriptions').select('user_id,customer_email').eq('stripe_subscription_id',row.stripe_subscription_id).maybeSingle();
  if(existing.error)throw Error('Could not read the subscription.');
  let owner=userId||existing.data?.user_id||null;const mail=(email||existing.data?.customer_email||'').toLowerCase()||null;
  // Paid from the website without signing in: match the verified account with the paying email.
  if(!owner&&mail){const m=await client.rpc('user_id_by_email',{p_email:mail});if(!m.error&&m.data)owner=m.data}
  const w=await client.from('subscriptions').upsert({...row,user_id:owner,customer_email:mail},{onConflict:'stripe_subscription_id'});
  if(w.error)throw Error('Could not save the subscription.');if(owner)users.add(owner);
 };
 if(type==='checkout.session.completed'){
  if(obj.mode!=='subscription'||!obj.subscription)return {ignored:true,users:[]};
  const id=typeof obj.subscription==='string'?obj.subscription:obj.subscription.id;
  const ref=/^[0-9a-f-]{36}$/i.test(obj.client_reference_id||'')?obj.client_reference_id:null,email=obj.customer_details?.email||obj.customer_email||null;
  let sub=typeof obj.subscription==='object'?obj.subscription:null;
  if(!sub?.status&&secretKey)sub=await stripeGet('subscriptions/'+encodeURIComponent(id),{secretKey,fetcher,apiBase});
  if(sub&&productOf(sub)&&product&&productOf(sub)!==product)return {ignored:true,users:[]};
  // Without the secret key the period is unknown until customer.subscription.* arrives; a completed checkout is active.
  const row=sub?.status?subscriptionRow(sub):{stripe_subscription_id:id,stripe_customer_id:typeof obj.customer==='string'?obj.customer:null,status:'active',price_id:null,current_period_end:null,cancel_at_period_end:false,updated_at:new Date().toISOString()};
  await save(row,ref,email);
 }else if(['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed'].includes(type)){
  if(productOf(obj)&&product&&productOf(obj)!==product)return {ignored:true,users:[]};
  // Stripe may deliver events out of order (created after updated); the current object from the API is the truth.
  const current=secretKey&&type!=='customer.subscription.deleted'?await stripeGet('subscriptions/'+encodeURIComponent(obj.id),{secretKey,fetcher,apiBase}).catch(()=>obj):obj;
  const row=subscriptionRow(current);if(type==='customer.subscription.deleted')row.status='canceled';
  await save(row,null,null);
 }else return {ignored:true,users:[]};
 return {ignored:false,users:[...users]};
}
