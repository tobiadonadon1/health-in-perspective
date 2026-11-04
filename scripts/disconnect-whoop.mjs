#!/usr/bin/env node
// Disconnects every live WHOOP connection (live WHOOP sync becomes a seat-limited Pro feature). Keeps all readings.
//
//   Dry run (default, read-only):  SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/disconnect-whoop.mjs
//   Apply here:                     … TOKEN_ENCRYPTION_KEY=… WHOOP_CLIENT_ID=… WHOOP_CLIENT_SECRET=… node scripts/disconnect-whoop.mjs --apply
//   Apply inside the deployed API:  … ADMIN_TASK_SECRET=… node scripts/disconnect-whoop.mjs --apply --via-function
//     (use this when TOKEN_ENCRYPTION_KEY exists only as a Supabase secret)
//   --force  delete the stored tokens even when WHOOP refuses the revoke call (the member can remove Xeyo in WHOOP's app)
//   --json   machine-readable output
//
// Idempotent: run it again and members already disconnected are not listed; notices are written once.
// Xeyo has no scheduled WHOOP syncs or WHOOP webhooks (sync runs only when a member opens the app), so deleting the
// stored tokens is what stops all syncing.
import {createClient} from '@supabase/supabase-js';
import {disconnectAllWhoop} from '../supabase/functions/health-api/whoop-disconnect.mjs';
import {createSealer} from '../supabase/functions/health-api/sealing.mjs';

const args=new Set(process.argv.slice(2)),apply=args.has('--apply'),viaFunction=args.has('--via-function'),force=args.has('--force'),json=args.has('--json');
const need=(...names)=>{const missing=names.filter(n=>!process.env[n]);if(missing.length){console.error('Missing environment: '+missing.join(', '));process.exit(2)}};
need('SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY');
const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const day=v=>v?new Date(v).toISOString().replace('T',' ').slice(0,16)+' UTC':'—';

function printAffected(users){
 console.log(`${apply?'APPLY':'DRY RUN'} · live WHOOP connections found: ${users.length}\n`);
 if(!users.length){console.log('Nothing to disconnect.');return}
 const rows=users.map(u=>[u.user_id,u.email||'—',u.connected_at?day(u.connected_at):day(u.updated_at)+(u.connected_at?'':' *'),day(u.last_synced_at),String(u.readings)]);
 const head=['user id','email','connected','last synced','WHOOP readings kept'],w=head.map((h,i)=>Math.max(h.length,...rows.map(r=>r[i].length)));
 for(const r of [head,w.map(n=>'-'.repeat(n)),...rows])console.log(r.map((c,i)=>c.padEnd(w[i])).join('  '));
 if(users.some(u=>!u.connected_at))console.log('\n* Connected before Xeyo recorded connection dates: this is the last time the WHOOP grant was saved or refreshed.');
}

if(apply&&viaFunction){
 need('ADMIN_TASK_SECRET');
 const r=await fetch(process.env.SUPABASE_URL+'/functions/v1/health-api',{method:'POST',headers:{'Content-Type':'application/json','x-xeyo-admin':process.env.ADMIN_TASK_SECRET,Origin:'https://app.xeyo.ai'},body:JSON.stringify({action:'admin-whoop-disconnect',dryRun:false,force})});
 const out=await r.json();if(!r.ok){console.error(out.error||r.status);process.exit(1)}
 if(json)console.log(JSON.stringify(out,null,2));else{printAffected(out.affected);console.log('');for(const x of out.results)console.log(`${x.ok?'✓':'✗'} ${x.email||x.userId}  ${x.ok?(x.revoked?'revoked at WHOOP':'tokens deleted, not revoked ('+x.reason+')'):'FAILED: '+x.error}`)}
 process.exit(out.results.every(x=>x.ok)?0:1);
}
// WHOOP_API_BASE (tests only) sends WHOOP calls to a local stand-in instead of api.prod.whoop.com.
const whoopFetch=(u,init)=>fetch(process.env.WHOOP_API_BASE?String(u).replace('https://api.prod.whoop.com',process.env.WHOOP_API_BASE):u,init);
let sealer=null,refresh=null;
if(apply){
 need('TOKEN_ENCRYPTION_KEY','WHOOP_CLIENT_ID','WHOOP_CLIENT_SECRET');sealer=createSealer(process.env.TOKEN_ENCRYPTION_KEY);
 refresh=async token=>{const r=await whoopFetch('https://api.prod.whoop.com/oauth/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:token,scope:'offline',client_id:process.env.WHOOP_CLIENT_ID,client_secret:process.env.WHOOP_CLIENT_SECRET})});if(!r.ok)throw Error('refresh failed');return r.json()};
}
const out=await disconnectAllWhoop({client,unseal:v=>sealer.unseal(v),refresh,fetcher:whoopFetch,dryRun:!apply,force});
if(json){console.log(JSON.stringify(out,null,2));process.exit(0)}
printAffected(out.affected);
if(!apply){console.log(`\nFor each member, --apply would: revoke Xeyo's WHOOP access (DELETE /developer/v2/user/access, refreshing an expired token first),\ndelete the stored access and refresh tokens, cancel pending WHOOP authorizations, free any WHOOP seat, and show the\none-time "live WHOOP sync is now Pro" notice. Imported readings are kept. Nothing was changed.`);process.exit(0)}
console.log('');for(const x of out.results)console.log(`${x.ok?'✓':'✗'} ${x.email||x.userId}  ${x.ok?(x.revoked?'revoked at WHOOP':'tokens deleted, not revoked ('+x.reason+')'):'FAILED: '+x.error}`);
process.exit(out.results.every(x=>x.ok)?0:1);
