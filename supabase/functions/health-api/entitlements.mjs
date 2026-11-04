// Free and Pro. Every protected action is checked here on the server, before it runs; the app only mirrors the result.
// History is also enforced in the database (health_readings RLS: 30 days for Free), so nothing relies on hidden UI.
export const FREE_LIMITS={historyDays:30,askPerMonth:3};
export const PRO_PRICE={amount:5,currency:'EUR',label:'€5/month'};
export const PRO_FEATURES={
 whoop_live:'Live WHOOP sync',
 weekly_report:'The AI Weekly Health Report',
 correlations:'Cross-wearable correlations',
 full_history:'Full history with 90-day and 1-year charts',
 csv_export:'CSV export',
 ask_unlimited:'Unlimited Ask Xeyo',
};
// Actions that only Pro members may run. Ask Xeyo is metered instead (FREE_LIMITS.askPerMonth), see meterAsk.
/** @type {Record<string,string>} */
export const ACTION_FEATURE={
 'whoop-connect':'whoop_live','whoop-complete':'whoop_live','whoop-sync':'whoop_live',
 'weekly-report':'weekly_report','weekly-report-email':'weekly_report',
 'correlations':'correlations','export-csv':'csv_export',
};
export class PlanError extends Error{constructor(message,status,extra){super(message);this.status=status;Object.assign(this,extra)}}
// WHOOP_SEAT_CAP: 10 while WHOOP's Sandbox tier applies; raise to 100 when WHOOP approves Build.
export function seatCap(value){const n=Number(value===undefined||value===null||value===''?10:value);return Number.isInteger(n)&&n>=0&&n<=100000?n:10}
export const monthKey=(now=Date.now())=>new Date(now).toISOString().slice(0,7);

export async function planFor(client,userId){
 const r=await client.from('subscriptions').select('status,current_period_end,cancel_at_period_end').eq('user_id',userId).order('updated_at',{ascending:false});
 if(r.error)throw Error('Could not check your plan.');
 const pro=await client.rpc('is_pro',{owner:userId});if(pro.error)throw Error('Could not check your plan.');
 const best=(r.data||[]).find(s=>['active','trialing','past_due'].includes(s.status))||r.data?.[0]||null;
 return {pro:pro.data===true,status:best?.status||'free',periodEnd:best?.current_period_end||null,cancelAtPeriodEnd:!!best?.cancel_at_period_end};
}
// Throws a 402 the app turns into the Upgrade gate. Runs before the action does any work.
export function requirePro(action,plan){
 const feature=ACTION_FEATURE[action];if(!feature||plan.pro)return;
 throw new PlanError(`${PRO_FEATURES[feature]} is part of Xeyo Pro.`,402,{code:'pro_required',feature});
}
// Free members get FREE_LIMITS.askPerMonth questions a month; the use is taken atomically before the AI is called
// and given back if the answer fails, so a failed request never costs a question.
export async function meterAsk(client,userId,plan,now=Date.now()){
 if(plan.pro)return null;
 const period=monthKey(now),r=await client.rpc('take_feature_use',{owner:userId,p_feature:'ask',p_period:period,quota:FREE_LIMITS.askPerMonth});
 if(r.error)throw Error('Could not check your Ask Xeyo allowance.');
 if(!r.data.ok)throw new PlanError(`You've used your ${FREE_LIMITS.askPerMonth} free Ask Xeyo questions this month. Pro includes unlimited questions.`,402,{code:'quota',feature:'ask_unlimited',used:r.data.used,quota:r.data.quota});
 return {refund:async()=>{await client.rpc('refund_feature_use',{owner:userId,p_feature:'ask',p_period:period})},used:r.data.used,quota:r.data.quota};
}
export async function askUsage(client,userId,plan,now=Date.now()){
 if(plan.pro)return {used:0,quota:null};
 const r=await client.from('feature_usage').select('used').eq('user_id',userId).eq('feature','ask').eq('period',monthKey(now)).maybeSingle();
 return {used:r.data?.used||0,quota:FREE_LIMITS.askPerMonth};
}
// Seat for live WHOOP sync. 'pending' while the member is at WHOOP's consent screen; 'active' once connected.
export async function claimSeat(client,userId,cap,{activate=false}={}){
 const r=await client.rpc('claim_whoop_seat',{owner:userId,cap,activate});if(r.error)throw Error('Could not reserve a live WHOOP seat. Try again.');
 if(r.data.ok)return r.data;
 if(r.data.reason==='pro_required')throw new PlanError('Live WHOOP sync is part of Xeyo Pro.',402,{code:'pro_required',feature:'whoop_live'});
 throw new PlanError('Pro WHOOP seats are full. Join the waitlist and we will email you when one opens.',409,{code:'seats_full',feature:'whoop_live',seats:{cap:r.data.cap,taken:r.data.taken,left:0}});
}
export async function seatSummary(client,userId,cap){const r=await client.rpc('whoop_seat_summary',{owner:userId,cap});if(r.error)throw Error('Could not read WHOOP seats.');return r.data}
