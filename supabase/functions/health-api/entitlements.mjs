// Free and Pro. Every protected action is checked here on the server, before it runs; the app only mirrors the result.
// History is also enforced in the database (health_readings RLS: 30 days for Free), so nothing relies on hidden UI.
export const FREE_LIMITS={historyDays:30};
export const PRO_PRICE={amount:5,currency:'EUR',label:'€5/month'};
export const PRO_FEATURES={
 whoop_live:'Live WHOOP sync',
 weekly_report:'The AI Weekly Health Report',
 correlations:'Cross-wearable correlations',
 full_history:'Full history with 90-day and 1-year charts',
 csv_export:'CSV export',
 smart_ai:'A frontier AI model and 3× the AI allowance',
};
// Actions that only Pro members may run. The included AI is metered by cost instead, see meteredAI.
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
// The AI included with every plan runs on Xeyo's own Anthropic key and is metered by what it really costs, per member
// per calendar month (UTC), in micro-dollars. Free: Claude Haiku up to $1. Pro: Claude Sonnet up to $2.50, then Haiku,
// never past $3. A member's own API key is never metered. The daily cap only stops runaway loops.
export const AI_PLAN={
 free:{model:'claude-haiku-5-5',budget:1_000_000,daily:60},
 pro:{model:'claude-sonnet-5-5',fallback:'claude-haiku-5-5',premiumUntil:2_500_000,budget:3_000_000,daily:200},
};
// $ per million tokens. tokens × ($/MTok) = micro-dollars. Haiku 5.5 has a second rate card above 100K prompt tokens.
const AI_RATES={'claude-haiku-5-5':{in:.10,out:.50,longIn:.50,longOut:2.50},'claude-sonnet-5-5':{in:2,out:10},'claude-opus-5-5':{in:4,out:20}};
export function aiCostMicros(model,usage){
 const r=AI_RATES[model];if(!r||!usage)return 0;
 const n=v=>Math.max(0,Number(v)||0),input=n(usage.input_tokens),write=n(usage.cache_creation_input_tokens),read=n(usage.cache_read_input_tokens),out=n(usage.output_tokens);
 const long=!!r.longIn&&input+write+read>100000,pin=long?r.longIn:r.in,pout=long?r.longOut:r.out;
 return Math.ceil(input*pin+write*pin*1.25+read*pin*.1+out*pout);
}
// Members see a plain name, never the model id: everyday AI on Free, a frontier model on Pro.
export const AI_MODEL_NAMES={'claude-haiku-5-5':'Everyday AI','claude-sonnet-5-5':'Frontier AI','claude-opus-5-5':'Frontier AI'};
const nextMonth=now=>{const d=new Date(now);return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1))};
export const resetLabel=(now=Date.now())=>nextMonth(now).toLocaleDateString('en-GB',{day:'numeric',month:'long',timeZone:'UTC'});
export function aiAllowance(plan,spent,now=Date.now()){
 const p=plan?.pro?AI_PLAN.pro:AI_PLAN.free,model=plan?.pro&&spent>=p.premiumUntil?p.fallback:p.model;
 return {tier:plan?.pro?'pro':'free',model,modelName:AI_MODEL_NAMES[model],percent:Math.min(100,Math.round(spent/p.budget*100)),left:Math.max(0,p.budget-spent),daily:p.daily,resets:nextMonth(now).toISOString().slice(0,10)};
}
export async function aiSpend(client,userId,now=Date.now()){
 const r=await client.from('feature_usage').select('used').eq('user_id',userId).eq('feature','ai_spend').eq('period',monthKey(now)).maybeSingle();
 if(r.error)throw Error('Could not check your AI allowance.');return Number(r.data?.used)||0;
}
export async function aiUsage(client,userId,plan,now=Date.now()){const a=aiAllowance(plan,await aiSpend(client,userId,now),now);delete a.left;return a}
// The included AI for one member, or a 402 the app turns into the Upgrade gate (Free) or a reset date (Pro).
// onUsage adds the answer's real cost once it arrives; a failed request costs nothing.
export async function meteredAI(client,userId,key,{plan=null,now=Date.now()}={}){
 if(!key)return null;
 plan=plan||await planFor(client,userId);
 const a=aiAllowance(plan,await aiSpend(client,userId,now),now);
 if(a.left<=0)throw new PlanError(plan.pro?`You have used this month’s AI allowance. It resets on ${resetLabel(now)}.`:`You have used this month’s free AI. It resets on ${resetLabel(now)}. Pro answers with a frontier AI model and has three times the allowance.`,402,{code:'quota',feature:'smart_ai',used:a.percent,quota:100,pro:!!plan.pro,resets:a.resets});
 return {provider:'anthropic',model:a.model,key,included:true,tier:a.tier,daily:a.daily,
  onUsage:async(usage,model)=>{const amount=aiCostMicros(model,usage);if(amount>0){const r=await client.rpc('add_feature_use',{owner:userId,p_feature:'ai_spend',p_period:monthKey(now),amount});if(r.error)console.error('ai-spend',r.error.message)}}};
}
// Seat for live WHOOP sync. 'pending' while the member is at WHOOP's consent screen; 'active' once connected.
export async function claimSeat(client,userId,cap,{activate=false}={}){
 const r=await client.rpc('claim_whoop_seat',{owner:userId,cap,activate});if(r.error)throw Error('Could not reserve a live WHOOP seat. Try again.');
 if(r.data.ok)return r.data;
 if(r.data.reason==='pro_required')throw new PlanError('Live WHOOP sync is part of Xeyo Pro.',402,{code:'pro_required',feature:'whoop_live'});
 throw new PlanError('Pro WHOOP seats are full. Join the waitlist and we will email you when one opens.',409,{code:'seats_full',feature:'whoop_live',seats:{cap:r.data.cap,taken:r.data.taken,left:0}});
}
export async function seatSummary(client,userId,cap){const r=await client.rpc('whoop_seat_summary',{owner:userId,cap});if(r.error)throw Error('Could not read WHOOP seats.');return r.data}
