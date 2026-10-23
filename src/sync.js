// One provider sync per session at a time; the server also coordinates other tabs.
export function createSyncController({loadConnections,sync,reload,onState,now=Date.now}){
 let pending=null;
 return {run(){if(pending)return pending;onState({busy:true,error:null});pending=(async()=>{
  try{const connections=await loadConnections();const live=connections.filter(c=>c.provider==='whoop');const results=await Promise.allSettled(live.map(c=>sync(c.provider)));const errors=results.filter(r=>r.status==='rejected').map(r=>r.reason?.message||'Connection could not refresh');const running=results.some(r=>r.status==='fulfilled'&&r.value.reason==='in_progress');await reload();onState({busy:false,checkedAt:now(),error:errors.join(' · ')||null,inProgress:running,live:live.length>0});return {ok:!errors.length,inProgress:running,live:live.length>0};}
  catch(error){onState({busy:false,error:error.message||'Could not refresh your data'});return {ok:false};}
  finally{pending=null;}
 })();return pending;}};
}
