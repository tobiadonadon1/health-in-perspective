// The Stripe account also bills other businesses. Without an API key, a checkout counts only when it came from the Xeyo payment link.
import test from 'node:test';import assert from 'node:assert/strict';
import {applyStripeEvent,DEFAULT_PAYMENT_LINK_ID} from '../supabase/functions/health-api/billing.mjs';

function fakeClient(){const rows=[];return {rows,from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})}),upsert:async row=>{rows.push(row);return {error:null}}}),rpc:async()=>({data:'11111111-1111-4111-8111-111111111111',error:null})}}
const checkout=extra=>({type:'checkout.session.completed',data:{object:{mode:'subscription',subscription:'sub_1',customer:'cus_1',customer_details:{email:'member@example.com'},...extra}}});

test('without an API key, a subscription checkout from another business is ignored',async()=>{
 const client=fakeClient();
 for(const extra of [{},{payment_link:'plink_other'}]){const r=await applyStripeEvent(checkout(extra),{client});assert.equal(r.ignored,true)}
 assert.equal(client.rows.length,0,'nothing saved');
});
test('without an API key, a checkout from the Xeyo payment link makes the payer Pro',async()=>{
 const client=fakeClient();const r=await applyStripeEvent(checkout({payment_link:DEFAULT_PAYMENT_LINK_ID}),{client});
 assert.equal(r.ignored,false);assert.equal(client.rows[0].status,'active');assert.equal(client.rows[0].customer_email,'member@example.com');
});
test('subscription events for other products are ignored',async()=>{
 const client=fakeClient();
 const r=await applyStripeEvent({type:'customer.subscription.updated',data:{object:{id:'sub_2',status:'active',items:{data:[{price:{id:'p',product:'prod_other'},current_period_end:2e9}]}}}},{client});
 assert.equal(r.ignored,true);assert.equal(client.rows.length,0);
});
test('a keyless checkout after subscription.created only links the member, keeping the stored period',async()=>{
 const updates=[],upserts=[];
 const client={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{user_id:null,customer_email:null},error:null})})}),upsert:async r=>{upserts.push(r);return {error:null}},update:r=>({eq:async()=>{updates.push(r);return {error:null}}})}),rpc:async()=>({data:'11111111-1111-4111-8111-111111111111',error:null})};
 await applyStripeEvent(checkout({payment_link:DEFAULT_PAYMENT_LINK_ID}),{client});
 assert.equal(upserts.length,0);assert.deepEqual(updates,[{user_id:'11111111-1111-4111-8111-111111111111',customer_email:'member@example.com'}]);
});
