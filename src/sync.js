// One provider sync per session at a time; the server also coordinates other tabs.
export function createSyncController({loadConnections,sync,reload,onState,now=Date.now}){
 let pending=null;
 return {run(){if(pending)return pending;onState({busy:true,error:null});pending=(async()=>{
  try{const connections=await loadConnections();const live=connections.filter(c=>c.provider==='whoop');const results=await Promise.allSettled(live.map(c=>sync(c.provider)));const errors=results.filter(r=>r.status==='rejected').map(r=>r.reason?.message||'Connection could not refresh');const running=results.some(r=>r.status==='fulfilled'&&r.value.reason==='in_progress');
  // cycles: true when WHOOP shared its daily cycles (strain, calories, heart rate), false when the connection lacks
  // that permission, and undefined when the server sync does not request them yet.
  const done=results.find(r=>r.status==='fulfilled'&&r.value.reason!=='in_progress'),cycles=done?done.value.cycles:undefined;await reload();onState({busy:false,checkedAt:now(),error:errors.join(' · ')||null,inProgress:running,live:live.length>0,...(done?{cycles}:{})});return {ok:!errors.length,inProgress:running,live:live.length>0,...(cycles===undefined?{}:{cycles})};}
  catch(error){onState({busy:false,error:error.message||'Could not refresh your data'});return {ok:false};}
  finally{pending=null;}
 })();return pending;}};
}
