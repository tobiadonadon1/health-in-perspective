// Runs the local backend with three seeded accounts so the real app can be tried end to end:
//   node tests/local-stack/serve.mjs   then   VITE_SUPABASE_URL=<printed url> VITE_SUPABASE_PUBLISHABLE_KEY=<printed key> npm run dev
// free@xeyo.test (Free, WHOOP export imported 9 days ago, the "live WHOOP is now Pro" notice), pro@xeyo.test (Pro, live WHOOP
// + Garmin, 120 days of data), new@xeyo.test (no profile: onboarding). Password for all: test-password-1. SEATS=10 fills every seat.
import {writeFileSync} from 'node:fs';
import {startStack} from './stack.mjs';
import {createSealer} from '../../supabase/functions/health-api/sealing.mjs';

const s=await startStack({env:{GARMIN_CLIENT_ID:'local-garmin',GARMIN_CLIENT_SECRET:'local-garmin-secret'},log:process.env.LOG==='1'});
const q=v=>`'${String(v).replace(/'/g,"''")}'`,day=86400000,now=Date.now();
const [free,pro,fresh]=[await s.createUser('free@xeyo.test',{meta:{name:'Alex'}}),await s.createUser('pro@xeyo.test',{meta:{name:'Sam'}}),await s.createUser('new@xeyo.test')];
for(const u of [free,pro])await s.psql(`insert into public.profiles(user_id,representation,gender,age,peer_opt_in) values(${q(u.id)},'stats','unspecified',34,false)`);
// Deterministic, believable readings: a slow weekly rhythm plus noise; short nights pull next-day recovery down.
let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
function rows(userId,source,days,{garmin=false}={}){const out=[];for(let d=days-1;d>=0;d--){
 const wake=new Date(now-d*day);wake.setHours(7,10,0,0);if(wake>now)wake.setTime(now-60000);const t=wake.toISOString(),key=t.slice(0,10),sleep=6+rnd()*2.4,late=rnd()<.3;
 const rec=Math.round(Math.min(98,Math.max(18,48+(sleep-6.5)*14-(late?9:0)+rnd()*18))),hrv=Math.round(38+rec/4+rnd()*6);
 const add=(kind,unit,value,at=t,src=source)=>out.push(`(${q(userId)},${q(kind)},${value},${q(unit)},${q(src)},${q(src+':'+kind+':'+key)},${q(at)})`);
 add('recovery','%',rec);add('hrv','ms',hrv);add('resting_hr','bpm',Math.round(62-rec/12+rnd()*3));add('sleep','hours',sleep.toFixed(2));
 add('sleep_deep','hours',(sleep*.19).toFixed(2));add('sleep_rem','hours',(sleep*.23).toFixed(2));add('sleep_light','hours',(sleep*.58).toFixed(2));
 add('strain','',(8+rnd()*9).toFixed(1));add('energy_burned','kcal',Math.round(1900+rnd()*900),d===0?new Date(now-2*3600000).toISOString():t);
 const start=new Date(wake);start.setHours(late?19+Math.floor(rnd()*2):7+Math.floor(rnd()*4),15);if(rnd()<.7&&start<now)add('workout','min',Math.round(35+rnd()*40),start.toISOString());
 if(garmin){add('steps','',Math.round(6000+rnd()*7000),key+'T12:00:00Z','Garmin');add('active_energy','kcal',Math.round(350+rnd()*500),key+'T12:00:00Z','Garmin')}
}return out}
const insert=async list=>{for(let i=0;i<list.length;i+=800)await s.psql(`insert into public.health_readings(user_id,kind,value,unit,source,external_id,observed_at) values ${list.slice(i,i+800).join(',')} on conflict do nothing`)};
await insert(rows(free.id,'WHOOP import · WHOOP',60));await insert(rows(pro.id,'WHOOP',120,{garmin:true}));
await s.psql(`insert into public.wearable_imports(user_id,provider,imported_at,row_count,first_day,last_day,files) values(${q(free.id)},'whoop',now()-interval '9 days',540,current_date-60,current_date-9,'{physiological_cycles.csv,sleeps.csv}')`);
await s.psql(`insert into public.account_notices(user_id,kind) values(${q(free.id)},'whoop_live_now_pro')`);
await s.psql(`insert into public.subscriptions(stripe_subscription_id,user_id,stripe_customer_id,status,current_period_end) values('sub_local_pro',${q(pro.id)},'cus_local_pro','active',now()+interval '24 days')`);
const sealer=createSealer(s.env.TOKEN_ENCRYPTION_KEY);
await s.psql(`insert into public.wearable_secrets(user_id,provider,encrypted_tokens,connected_at,last_synced_at) values(${q(pro.id)},'whoop',${q(await sealer.seal({access_token:'local',refresh_token:'local',expires_at:now+3600000}))},now()-interval '20 days',now()-interval '1 hour'),(${q(pro.id)},'garmin',${q(await sealer.seal({access_token:'g',refresh_token:'g',expires_at:now+3600000}))},now()-interval '20 days',now()-interval '3 hours')`);
await s.psql(`insert into public.whoop_seats(user_id,status) values(${q(pro.id)},'active')`);
// Other members holding seats: 9 of 10 taken by default (1 left), or all 10 with SEATS=10.
const others=Number(process.env.SEATS||9)-1;for(let i=0;i<others;i++){const u=await s.createUser(`seat${i}@xeyo.test`);await s.psql(`insert into public.subscriptions(stripe_subscription_id,user_id,status,current_period_end) values('sub_seat${i}',${q(u.id)},'active',now()+interval '30 days');insert into public.whoop_seats(user_id,status) values(${q(u.id)},'active')`)}
const info={url:s.url,anonKey:s.anonKey,users:{free:free.email,pro:pro.email,new:fresh.email},password:'test-password-1',admin:s.env.ADMIN_TASK_SECRET,webhookSecret:s.env.STRIPE_WEBHOOK_SECRET};
if(process.env.INFO)writeFileSync(process.env.INFO,JSON.stringify(info));
console.log('local stack ready',JSON.stringify(info));
process.on('SIGINT',async()=>{await s.stop();process.exit(0)});process.on('SIGTERM',async()=>{await s.stop();process.exit(0)});
setInterval(()=>{},1<<30);
