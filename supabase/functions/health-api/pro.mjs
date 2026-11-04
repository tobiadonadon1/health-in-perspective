// Free/Pro actions for the health API: plan status, checkout, WHOOP seats and waitlist, lapses, file-import records,
// exports, and the server-side gate in front of every Pro feature. index.ts passes its context in.
import {FREE_LIMITS,PRO_PRICE,PlanError,planFor,requirePro,aiUsage,meteredAI,seatSummary,claimSeat,seatCap} from './entitlements.mjs';
import {checkoutUrl,verifyStripeSignature,applyStripeEvent,stripePortal,DEFAULT_PAYMENT_LINK,DEFAULT_PRO_PRODUCT,DEFAULT_PAYMENT_LINK_ID} from './billing.mjs';
import {disconnectWhoopMember,disconnectAllWhoop} from './whoop-disconnect.mjs';
import * as imports from './imports.mjs';
import {computeCorrelations} from './correlations.mjs';
import {buildWeeklyStats,weeklyReport,previousWeekStart,reportEmail,sendReportEmail,mondayOf} from './weeklyreport.mjs';

export const PRO_ACTIONS=new Set(['weekly-report','weekly-report-email','correlations','plan-status','checkout','billing-portal','whoop-waitlist-join','wearable-import-finish','wearable-import-behaviors','export-readings','export-csv','notice-dismiss']);
// Data transfers and status reads that never call AI or a provider: they do not spend the hourly request credit.
export const CREDIT_FREE=new Set(['plan-status','wearable-import-finish','wearable-import-behaviors','export-readings','notice-dismiss','whoop-waitlist-join']);

// Linking: a subscription paid on the website (no account id) attaches to the member with the same verified email.
async function linkByEmail(client,user){
 if(!user.email||!user.email_confirmed_at)return;
 await client.from('subscriptions').update({user_id:user.id}).is('user_id',null).eq('customer_email',user.email.toLowerCase());
}
// What Free hides right now: the member's own wearable readings older than 30 days (kept, shown again with Pro).
// Counts only, never values, so the Upgrade card can say what is waiting without revealing it.
export async function hiddenHistory(client,userId,now=Date.now()){
 const cutoff=new Date(now-FREE_LIMITS.historyDays*86400000).toISOString();
 const base=()=>client.from('health_readings').select('observed_at',{count:'exact'}).eq('user_id',userId).neq('source','Manual entry').lt('observed_at',cutoff);
 const r=await base().order('observed_at',{ascending:true}).limit(1);if(r.error)throw r.error;
 return {readings:r.count||0,since:r.data?.[0]?.observed_at?.slice(0,10)||null};
}
export async function planStatus(client,user,{cap}){
 await linkByEmail(client,user);
 const plan=await planFor(client,user.id);
 const [seats,wait,usage,imports,notices,hidden]=await Promise.all([
  seatSummary(client,user.id,cap),
  client.from('whoop_waitlist').select('joined_at').eq('user_id',user.id).maybeSingle(),
  aiUsage(client,user.id,plan).catch(()=>null),
  client.from('wearable_imports').select('provider,imported_at,row_count,first_day,last_day').eq('user_id',user.id).order('imported_at',{ascending:false}).limit(20),
  client.from('account_notices').select('kind,created_at').eq('user_id',user.id).is('seen_at',null),
  plan.pro?null:hiddenHistory(client,user.id).catch(()=>null)]);
 const latest={};for(const r of imports.data||[])if(!latest[r.provider])latest[r.provider]=r;
 return {plan,seats,waitlisted:!!wait.data,usage:{ai:usage},hidden,limits:FREE_LIMITS,price:PRO_PRICE,imports:latest,notices:(notices.data||[]).map(n=>n.kind)};
}

// Enforces a lapse for one member: no live WHOOP without Pro. Readings stay; the seat is freed.
export async function enforceLapse(client,userId,ctx){
 const pro=await client.rpc('is_pro',{owner:userId});if(pro.error||pro.data===true)return {lapsed:false};
 const seat=await client.from('whoop_seats').select('user_id').eq('user_id',userId).maybeSingle();
 const conn=await client.from('wearable_secrets').select('user_id').eq('user_id',userId).eq('provider','whoop').maybeSingle();
 if(!seat.data&&!conn.data)return {lapsed:false};
 const result=await disconnectWhoopMember(userId,{client,unseal:ctx.unseal,refresh:ctx.whoopRefresh,fetcher:ctx.fetcher,notice:'pro_lapsed',force:true});
 return {lapsed:true,...result};
}
export async function sweepLapsed(client,ctx){
 const r=await client.rpc('lapsed_whoop_seats');if(r.error)throw Error('Could not list lapsed seats.');
 const ids=new Set((r.data||[]).map(x=>typeof x==='string'?x:x.lapsed_whoop_seats||x.user_id));
 // Connections without a seat (made before seats existed, or a failed release) lapse too unless the member is Pro.
 const live=await client.from('wearable_secrets').select('user_id').eq('provider','whoop');
 for(const row of live.data||[])ids.add(row.user_id);
 const out=[];for(const id of ids)if(id)out.push(await enforceLapse(client,id,ctx));return out.filter(x=>x.lapsed);
}

// POST ?hook=stripe — Stripe webhooks. Signature checked on the raw body before anything is parsed or stored.
export async function handleStripeHook(rawBody,signature,ctx){
 const event=await verifyStripeSignature(rawBody,signature,ctx.env('STRIPE_WEBHOOK_SECRET'));
 const result=await applyStripeEvent(event,{client:ctx.client,secretKey:ctx.env('STRIPE_SECRET_KEY'),product:ctx.env('STRIPE_PRO_PRODUCT')||DEFAULT_PRO_PRODUCT,paymentLinkId:ctx.env('STRIPE_PAYMENT_LINK_ID')||DEFAULT_PAYMENT_LINK_ID,fetcher:ctx.fetcher,apiBase:ctx.env('STRIPE_API_BASE')||undefined});
 const lapses=[];for(const id of result.users)lapses.push(await enforceLapse(ctx.client,id,ctx));
 return {received:true,ignored:result.ignored,lapsed:lapses.filter(l=>l.lapsed).length};
}

const CSV_COLUMNS=['observed_at','kind','value','unit','source'];
const csvCell=v=>{let s=v==null?'':String(v);if(/^[=+\-@\t\r]/.test(s))s="'"+s;return /[",\n\r]/.test(s)?'"'+s.replaceAll('"','""')+'"':s};
const safeZone=z=>{try{new Intl.DateTimeFormat('en',{timeZone:String(z)});return String(z)}catch{return 'UTC'}};
// Garmin's terms: Garmin data is never sent to an AI system, so anything that feeds the AI asks with forAI.
async function readingsSince(client,userId,since,until=null,{forAI=false}={}){
 const rows=[];for(let offset=0;offset<100000;offset+=1000){let q=client.from('health_readings').select('kind,value,unit,source,observed_at,external_id').eq('user_id',userId).gte('observed_at',since.toISOString());if(forAI)q=q.neq('source','Garmin');if(until)q=q.lte('observed_at',until.toISOString());const r=await q.order('observed_at').order('id').range(offset,offset+999);if(r.error)throw Error('Could not read your readings.');rows.push(...r.data);if(r.data.length<1000)break}
 return rows;
}
async function correlationsFor(client,userId,timeZone,{forAI=false}={}){
 const [readings,behaviors]=await Promise.all([readingsSince(client,userId,new Date(Date.now()-366*86400000),null,{forAI}),client.from('wearable_behaviors').select('day,question,answered_yes').eq('user_id',userId).gte('day',new Date(Date.now()-366*86400000).toISOString().slice(0,10))]);
 return {readings,result:computeCorrelations({readings,behaviors:behaviors.data||[],timeZone})};
}
// The member's weekly report for a week (default: the last complete one), generated once and stored.
export async function weeklyReportFor(client,userId,{weekStart,timeZone='UTC',ai=null,refresh=false}={}){
 const ws=weekStart?mondayOf(weekStart):previousWeekStart({timeZone});
 if(!refresh){const saved=await client.from('weekly_reports').select('content').eq('user_id',userId).eq('week_start',ws).maybeSingle();if(saved.data)return saved.data.content}
 const {readings,result}=await correlationsFor(client,userId,timeZone,{forAI:true}),start=Date.parse(ws+'T00:00:00Z');
 const window=readings.filter(r=>{const t=Date.parse(r.observed_at);return t>=start-29*86400000&&t<=start+8*86400000});
 // Pro reports use the member's metered Pro AI (Claude Sonnet); past the allowance the report is written by rules.
 if(ai?.key&&!ai.onUsage)ai=await meteredAI(client,userId,ai.key,{plan:{pro:true}}).then(m=>m&&{...m,fetcher:ai.fetcher}).catch(()=>null);
 const report=await weeklyReport({stats:buildWeeklyStats({readings:window,weekStart:ws,timeZone}),correlations:result,ai});delete report.aiError;
 const w=await client.from('weekly_reports').upsert({user_id:userId,week_start:report.weekStart,content:report,model:report.model||null},{onConflict:'user_id,week_start'});if(w.error)throw Error('Could not save your weekly report.');
 return report;
}
// Monday job (pro-maintenance with weekly:true): reports for Pro members who turned the email on.
export async function sendWeeklyEmails(client,ctx){
 const key=ctx.env('RESEND_API_KEY'),from=ctx.env('REPORT_FROM_EMAIL');if(!key||!from)return {sent:0,skipped:'email not configured'};
 const want=await client.from('report_settings').select('user_id').eq('email_weekly',true);let sent=0;const failed=[];
 for(const {user_id} of want.data||[]){
  try{const pro=await client.rpc('is_pro',{owner:user_id});if(pro.data!==true)continue;
   const user=await client.auth.admin.getUserById(user_id),to=user.data?.user?.email;if(!to)continue;
   const report=await weeklyReportFor(client,user_id,{ai:ctx.ai});
   const saved=await client.from('weekly_reports').select('emailed_at').eq('user_id',user_id).eq('week_start',report.weekStart).maybeSingle();if(saved.data?.emailed_at)continue;
   await sendReportEmail({to,email:reportEmail({report,appUrl:ctx.env('APP_ORIGIN')||'https://app.xeyo.ai'}),apiKey:key,from,fetcher:ctx.fetcher,idempotencyKey:'weekly:'+user_id+':'+report.weekStart});
   await client.from('weekly_reports').update({emailed_at:new Date().toISOString()}).eq('user_id',user_id).eq('week_start',report.weekStart);sent++;
  }catch(e){failed.push(user_id)}
 }
 return {sent,failed:failed.length};
}
async function allReadings(client,userId,limit=200000){
 const rows=[];for(let offset=0;offset<limit;offset+=1000){const r=await client.from('health_readings').select('observed_at,kind,value,unit,source,external_id').eq('user_id',userId).order('observed_at',{ascending:true}).order('kind').range(offset,offset+999);if(r.error)throw Error('Could not read your readings.');rows.push(...r.data);if(r.data.length<1000)break}
 return rows;
}

export async function handleProAction(payload,ctx){
 const {client,user,env,requestOrigin}=ctx,cap=seatCap(env('WHOOP_SEAT_CAP')),action=payload.action;
 if(action==='plan-status')return planStatus(client,user,{cap});
 const plan=await planFor(client,user.id);requirePro(action,plan);
 if(action==='correlations')return (await correlationsFor(client,user.id,safeZone(payload.timeZone))).result;
 if(action==='weekly-report'){
  const [report,settings]=await Promise.all([weeklyReportFor(client,user.id,{weekStart:typeof payload.week_start==='string'?payload.week_start:undefined,timeZone:safeZone(payload.timeZone),ai:ctx.ai,refresh:payload.refresh===true}),client.from('report_settings').select('email_weekly').eq('user_id',user.id).maybeSingle()]);
  return {report,email:{enabled:!!settings.data?.email_weekly,available:!!(env('RESEND_API_KEY')&&env('REPORT_FROM_EMAIL'))}};
 }
 if(action==='weekly-report-email'){
  const enabled=payload.enabled===true,w=await client.from('report_settings').upsert({user_id:user.id,email_weekly:enabled,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(w.error)throw Error('Could not save your email preference.');
  return {enabled,available:!!(env('RESEND_API_KEY')&&env('REPORT_FROM_EMAIL'))};
 }
 if(action==='checkout'){
  if(plan.pro)return {url:null,alreadyPro:true};
  ctx.track?.('checkout_started',{from:String(payload.from||'').slice(0,40)});
  return {url:checkoutUrl({paymentLink:env('STRIPE_PAYMENT_LINK')||DEFAULT_PAYMENT_LINK,userId:user.id,email:user.email})};
 }
 if(action==='billing-portal'){
  const sub=await client.from('subscriptions').select('stripe_customer_id').eq('user_id',user.id).not('stripe_customer_id','is',null).order('updated_at',{ascending:false}).limit(1).maybeSingle();
  if(!sub.data)throw new PlanError('No Xeyo Pro subscription is linked to this account.',404,{code:'no_subscription'});
  if(!env('STRIPE_SECRET_KEY'))throw Error('Manage your subscription from the link in your Stripe receipt email.');
  return {url:await stripePortal({secretKey:env('STRIPE_SECRET_KEY'),customer:sub.data.stripe_customer_id,returnUrl:(requestOrigin||'https://app.xeyo.ai')+'/#/profile',fetcher:ctx.fetcher,apiBase:env('STRIPE_API_BASE')||undefined})};
 }
 if(action==='whoop-waitlist-join'){
  const w=await client.from('whoop_waitlist').upsert({user_id:user.id,email:user.email},{onConflict:'user_id',ignoreDuplicates:true});if(w.error)throw Error('Could not join the waitlist. Try again.');
  const mine=await client.from('whoop_waitlist').select('joined_at').eq('user_id',user.id).single();
  const ahead=await client.from('whoop_waitlist').select('user_id',{count:'exact',head:true}).lt('joined_at',mine.data.joined_at);
  return {waitlisted:true,joinedAt:mine.data.joined_at,position:(ahead.count||0)+1};
 }
 if(action==='wearable-import-behaviors'){
  if(typeof imports.validateImportedBehaviors!=='function')throw Error('Journal imports are not available yet.');const rows=imports.validateImportedBehaviors(payload,user.id);
  const r=await client.from('wearable_behaviors').upsert(rows,{onConflict:'user_id,source,external_id'});if(r.error)throw Error('The journal answers could not be saved. Try importing again.');
  return {imported:rows.length};
 }
 if(action==='wearable-import-finish'){
  const provider=payload.provider,day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;
  if(!['apple','fitbit','whoop'].includes(provider))throw Error('Unknown import.');
  const files=Array.isArray(payload.files)?payload.files.filter(f=>typeof f==='string').slice(0,20).map(f=>f.replace(/[^\w.\- ]/g,'').slice(0,120)):[];
  const row={user_id:user.id,provider,row_count:Math.max(0,Math.min(10000000,Math.round(Number(payload.row_count)||0))),first_day:day(payload.first_day),last_day:day(payload.last_day),files};
  // WHOOP exports imported before start-time ids existed used per-day hashes; the new rows for the same days replace them.
  if(provider==='whoop'&&row.first_day&&row.last_day){const until=new Date(Date.parse(row.last_day+'T00:00:00Z')+2*86400000).toISOString();await client.from('health_readings').delete().eq('user_id',user.id).eq('source','WHOOP import · WHOOP').like('external_id','import:%').gte('observed_at',row.first_day+'T00:00:00Z').lt('observed_at',until)}
  const r=await client.from('wearable_imports').insert(row).select('imported_at').single();if(r.error)throw Error('Could not record the import.');
  return {imported_at:r.data.imported_at};
 }
 // Everyone can download everything they stored (their right of access), including history beyond the Free window.
 if(action==='export-readings')return {rows:await allReadings(client,user.id)};
 if(action==='export-csv'){
  const rows=await allReadings(client,user.id);
  return {rows:rows.length,csv:[CSV_COLUMNS.join(','),...rows.map(r=>CSV_COLUMNS.map(k=>csvCell(r[k])).join(','))].join('\r\n')};
 }
 if(action==='notice-dismiss'){
  const kind=String(payload.kind||'');if(!/^[a-z][a-z_]{2,40}$/.test(kind))throw Error('Unknown notice.');
  await client.from('account_notices').update({seen_at:new Date().toISOString()}).eq('user_id',user.id).eq('kind',kind);return {dismissed:true};
 }
 throw Error('Unknown action.');
}

// WHOOP seat steps used by index.ts around the OAuth flow.
export async function whoopSeatForConnect(client,user,env){const plan=await planFor(client,user.id);requirePro('whoop-connect',plan);return claimSeat(client,user.id,seatCap(env('WHOOP_SEAT_CAP')))}
export async function whoopSeatForComplete(client,user,env){const plan=await planFor(client,user.id);requirePro('whoop-complete',plan);return claimSeat(client,user.id,seatCap(env('WHOOP_SEAT_CAP')),{activate:true})}
export {disconnectAllWhoop,disconnectWhoopMember};
