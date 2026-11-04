// Disconnecting live WHOOP connections while keeping every imported reading.
// Used by the one-off "live WHOOP is now Pro" migration (scripts/disconnect-whoop.mjs), by a lapsed Pro subscription,
// and by the member's own Disconnect button. Idempotent: a member without a stored WHOOP grant is simply skipped.
export const WHOOP_REVOKE_URL='https://api.prod.whoop.com/developer/v2/user/access';
export const WHOOP_NOTICE='whoop_live_now_pro';

// Revokes Xeyo's access at WHOOP. A token that can no longer be refreshed cannot be revoked by Xeyo either:
// the grant is then reported as not revoked (the member can remove Xeyo in WHOOP's own app).
/** @param {any} tokens @param {any} options */
export async function revokeWhoopGrant(tokens,{refresh,fetcher=fetch,now=Date.now()}){
 let access=tokens?.access_token;
 if(!access)return {revoked:false,reason:'no_token'};
 if(Number(tokens.expires_at)<now+60000){try{access=(await refresh(tokens.refresh_token)).access_token}catch{return {revoked:false,reason:'refresh_failed'}}}
 const r=await fetcher(WHOOP_REVOKE_URL,{method:'DELETE',headers:{Authorization:'Bearer '+access},signal:AbortSignal.timeout(15000)});
 if(r.ok||r.status===204)return {revoked:true};
 if(r.status===401)return {revoked:false,reason:'already_invalid'};
 throw Object.assign(Error('WHOOP could not revoke access ('+r.status+').'),{status:r.status});
}

// One member. Order matters for idempotency: revoke first (needs the tokens), then delete the tokens, pending
// authorizations and the seat, then leave the one-time notice. Readings in health_readings are never touched.
/** @param {string} userId @param {any} options */
export async function disconnectWhoopMember(userId,{client,unseal,refresh,fetcher=fetch,notice=WHOOP_NOTICE,force=false,now=Date.now()}){
 const stored=await client.from('wearable_secrets').select('encrypted_tokens').eq('user_id',userId).eq('provider','whoop').maybeSingle();
 if(stored.error)throw Error('Could not read the WHOOP connection.');
 let revoke={revoked:false,reason:'not_connected'};
 if(stored.data){
  let tokens=null;try{tokens=await unseal(stored.data.encrypted_tokens)}catch{revoke={revoked:false,reason:'unreadable_token'}}
  if(tokens){try{revoke=await revokeWhoopGrant(tokens,{refresh,fetcher,now})}catch(e){if(!force)throw e;revoke={revoked:false,reason:'revoke_failed'}}}
  const d=await client.from('wearable_secrets').delete().eq('user_id',userId).eq('provider','whoop');if(d.error)throw Error('Could not delete the WHOOP tokens.');
 }
 // Pending WHOOP authorizations (states without the Google/Garmin prefixes) are cancelled too.
 const states=await client.from('oauth_states').select('state').eq('user_id',userId);
 const whoopStates=(states.data||[]).map(s=>s.state).filter(s=>!/^(gh|gm)\./.test(s));
 if(whoopStates.length)await client.from('oauth_states').delete().in('state',whoopStates);
 await client.rpc('release_whoop_seat',{owner:userId});
 if(notice)await client.from('account_notices').upsert({user_id:userId,kind:notice},{onConflict:'user_id,kind',ignoreDuplicates:true});
 return {userId,hadConnection:!!stored.data,...revoke};
}

// The migration: list (dry run) or disconnect (apply) every live WHOOP connection.
/** @param {any} options */
export async function disconnectAllWhoop({client,unseal,refresh,fetcher=fetch,dryRun=true,force=false,log=()=>{}}){
 const report=await client.rpc('whoop_connections_report');let affected=report.data||[];const results=[];
 if(report.error){
  // Before the Free/Pro migration is applied the report function does not exist yet: a dry run still lists the
  // connections read-only; applying needs the migration (seats and notices live in its tables).
  if(!dryRun)throw Error('Apply the Free/Pro database migration before disconnecting (whoop_connections_report is missing): '+report.error.message);
  affected=await legacyReport(client);
 }
 log({type:'affected',count:affected.length,users:affected});
 if(dryRun)return {dryRun:true,affected,results};
 for(const row of affected){
  try{results.push({...await disconnectWhoopMember(row.user_id,{client,unseal,refresh,fetcher,force}),email:row.email,ok:true})}
  catch(e){results.push({userId:row.user_id,email:row.email,ok:false,error:e.message})}
  log({type:'result',result:results.at(-1)});
 }
 return {dryRun:false,affected,results};
}

async function legacyReport(client){
 const rows=await client.from('wearable_secrets').select('user_id,updated_at,last_synced_at').eq('provider','whoop').order('updated_at');
 if(rows.error)throw Error('Could not list WHOOP connections: '+rows.error.message);
 const out=[];for(const w of rows.data||[]){
  const u=await client.auth.admin.getUserById(w.user_id);
  const first=await client.from('health_readings').select('observed_at').eq('user_id',w.user_id).eq('source','WHOOP').order('observed_at').limit(1).maybeSingle();
  const count=await client.from('health_readings').select('id',{count:'exact',head:true}).eq('user_id',w.user_id).eq('source','WHOOP');
  out.push({user_id:w.user_id,email:u.data?.user?.email||null,connected_at:null,updated_at:w.updated_at,last_synced_at:w.last_synced_at,first_reading:first.data?.observed_at||null,readings:count.count??0});
 }
 return out;
}
