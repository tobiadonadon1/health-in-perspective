// A local, throwaway Supabase-shaped backend for end-to-end tests: real PostgreSQL 17 + PostgREST running
// database/schema.sql, a small auth stand-in (password sign-in, getUser, metadata updates), the real health-api edge
// function under Deno, and stand-ins for Stripe and WHOOP. Nothing leaves 127.0.0.1.
// Needs: postgres/initdb/pg_ctl/psql, postgrest and deno on PATH. `available()` says whether they are.
import {spawn,execFile,execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import net from 'node:net';

const here=dirname(fileURLToPath(import.meta.url)),root=join(here,'..','..');
const has=bin=>{try{execFileSync('which',[bin],{stdio:'ignore'});return true}catch{return false}};
export const available=()=>['initdb','pg_ctl','psql','postgrest','deno'].every(has);
const freePort=()=>new Promise(res=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>res(p))})});
const b64u=v=>Buffer.from(v).toString('base64url');
export function jwt(payload,secret){const h=b64u(JSON.stringify({alg:'HS256',typ:'JWT'})),p=b64u(JSON.stringify(payload));return `${h}.${p}.${createHmac('sha256',secret).update(h+'.'+p).digest('base64url')}`}
function verify(token,secret){const [h,p,s]=String(token||'').split('.');if(!s||createHmac('sha256',secret).update(h+'.'+p).digest('base64url')!==s)return null;const c=JSON.parse(Buffer.from(p,'base64url'));return c.exp&&c.exp<Date.now()/1000?null:c}
const waitFor=async(check,ms=20000)=>{const end=Date.now()+ms;while(Date.now()<end){try{if(await check())return}catch{}await new Promise(r=>setTimeout(r,150))}throw Error('Local stack did not start in time')};
const body=req=>new Promise(res=>{let d='';req.on('data',c=>d+=c).on('end',()=>res(d))});

export async function startStack({env:extraEnv={},log=false}={}){
 const dir=mkdtempSync(join(tmpdir(),'xeyo-stack-')),data=join(dir,'pg'),secret=randomBytes(32).toString('hex');
 const [pgPort,restPort,gwPort,fnPort]=await Promise.all([freePort(),freePort(),freePort(),freePort()]);
 const procs=[];const out=s=>{if(log)process.stderr.write(s)};
 execFileSync('initdb',['-D',data,'-U','postgres','--auth=trust','-E','UTF8','--no-locale'],{stdio:'ignore'});
 execFileSync('pg_ctl',['-D',data,'-o',`-p ${pgPort} -k ${dir} -c listen_addresses=127.0.0.1 -c max_connections=200`,'-l',join(dir,'pg.log'),'-w','start'],{stdio:'ignore'});
 const psqlArgs=['-h','127.0.0.1','-p',String(pgPort),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-qAt'];
 const psql=sql=>new Promise((res,rej)=>execFile('psql',[...psqlArgs,'-c',sql],(e,stdout,stderr)=>e?rej(Error(stderr||e.message)):res(stdout.trim())));
 const psqlFile=file=>execFileSync('psql',[...psqlArgs,'-f',file],{stdio:['ignore','ignore','pipe']});
 psqlFile(join(here,'bootstrap.sql'));psqlFile(join(root,'database','schema.sql'));
 const conf=join(dir,'postgrest.conf');
 writeFileSync(conf,`db-uri = "postgres://authenticator:authenticator@127.0.0.1:${pgPort}/postgres"\ndb-schemas = "public"\ndb-anon-role = "anon"\njwt-secret = "${secret}"\nserver-host = "127.0.0.1"\nserver-port = ${restPort}\ndb-pool = 40\n`);
 const restProc=spawn('postgrest',[conf],{stdio:['ignore','pipe','pipe']});procs.push(restProc);restProc.stdout.on('data',d=>out(String(d)));restProc.stderr.on('data',d=>out(String(d)));

 const anonKey=jwt({role:'anon',iss:'supabase-local',exp:Math.floor(Date.now()/1000)+86400},secret),serviceKey=jwt({role:'service_role',iss:'supabase-local',exp:Math.floor(Date.now()/1000)+86400},secret);
 const users=new Map(),calls={stripe:[],whoop:[]},stripeSubs=new Map();
 const userJSON=u=>({id:u.id,aud:'authenticated',role:'authenticated',email:u.email,email_confirmed_at:u.confirmed?new Date().toISOString():null,user_metadata:u.meta,app_metadata:{provider:'email'},created_at:u.created});
 const session=u=>{const exp=Math.floor(Date.now()/1000)+3600;return {access_token:jwt({sub:u.id,role:'authenticated',aud:'authenticated',email:u.email,exp},secret),token_type:'bearer',expires_in:3600,expires_at:exp,refresh_token:'rt-'+u.id,user:userJSON(u)}};
 async function createUser(email,{password='test-password-1',confirmed=true,meta={}}={}){
  const u={id:randomUUID(),email,password,confirmed,meta,created:new Date().toISOString()};users.set(u.id,u);
  await psql(`insert into auth.users(id,email,email_confirmed_at) values('${u.id}','${email.replace(/'/g,"''")}',${confirmed?'now()':'null'})`);
  return {...u,token:session(u).access_token,session:session(u)};
 }
 const send=(res,status,obj,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS','Access-Control-Expose-Headers':'*',...headers});res.end(obj===undefined?'':JSON.stringify(obj))};
 const proxy=(req,res,port,path,extra={})=>new Promise(done=>{
  const headers={...req.headers,...extra};delete headers.host;
  if(!headers.authorization&&headers.apikey)headers.authorization='Bearer '+headers.apikey;
  const p=fetch(`http://127.0.0.1:${port}${path}`,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:req,duplex:'half'}).then(async r=>{
   const h={};r.headers.forEach((v,k)=>{if(!['content-encoding','transfer-encoding','connection'].includes(k)&&!k.startsWith('access-control-'))h[k]=v});
   res.writeHead(r.status,{...h,'Access-Control-Allow-Origin':req.headers.origin||'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS','Access-Control-Expose-Headers':'*'});res.end(Buffer.from(await r.arrayBuffer()));
  }).catch(e=>send(res,502,{error:String(e)}));p.finally(done);
 });
 const gateway=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://x'),path=url.pathname;
  if(req.method==='OPTIONS'&&!path.startsWith('/functions/'))return send(res,204);
  if(path.startsWith('/rest/v1/'))return proxy(req,res,restPort,path.slice(8)+url.search);
  if(path.startsWith('/functions/v1/'))return proxy(req,res,fnPort,'/'+path.slice(14)+url.search);
  if(path==='/auth/v1/token'){const b=JSON.parse(await body(req)||'{}');
   if(url.searchParams.get('grant_type')==='password'){const u=[...users.values()].find(x=>x.email===b.email&&x.password===b.password);return u?send(res,200,session(u)):send(res,400,{error:'invalid_grant',error_description:'Invalid login credentials'})}
   if(url.searchParams.get('grant_type')==='refresh_token'){const u=users.get(String(b.refresh_token).slice(3));return u?send(res,200,session(u)):send(res,400,{error:'invalid_grant'})}}
  if(path==='/auth/v1/user'){const c=verify((req.headers.authorization||'').replace(/^Bearer /i,''),secret),u=c&&users.get(c.sub);if(!u)return send(res,401,{msg:'invalid JWT'});
   if(req.method==='PUT'){const b=JSON.parse(await body(req)||'{}');if(b.data)u.meta={...u.meta,...b.data}}return send(res,200,userJSON(u))}
  if(path==='/auth/v1/logout')return send(res,204);
  if(path.startsWith('/storage/v1/'))return send(res,404,{error:'storage is not part of the local stack'});
  // Stripe stand-in: subscriptions are whatever the test put in stripeSubs; the portal returns a fixed URL.
  if(path.startsWith('/fake-stripe/')){calls.stripe.push({method:req.method,path});const m=path.match(/\/v1\/subscriptions\/([^/]+)$/);if(m)return stripeSubs.has(m[1])?send(res,200,stripeSubs.get(m[1])):send(res,404,{error:{message:'No such subscription'}});if(path.endsWith('/v1/billing_portal/sessions'))return send(res,200,{url:'https://billing.stripe.com/p/session/test'});return send(res,404,{})}
  // WHOOP stand-in: token exchange/refresh, the revoke endpoint and empty data pages.
  if(path.startsWith('/fake-whoop/')){const b=await body(req);calls.whoop.push({method:req.method,path,body:b,auth:req.headers.authorization||''});
   if(path.endsWith('/oauth/oauth2/token'))return send(res,200,{access_token:'whoop-access-'+randomUUID(),refresh_token:'whoop-refresh-'+randomUUID(),expires_in:3600,scope:'read:recovery read:sleep read:cycles offline'});
   if(path.endsWith('/developer/v2/user/access')&&req.method==='DELETE'){res.writeHead(204);return res.end()}
   if(path.includes('/developer/v2/'))return send(res,200,{records:[]});return send(res,404,{})}
  send(res,404,{error:'not found: '+path});
 }catch(e){send(res,500,{error:String(e)})}});
 await new Promise(r=>gateway.listen(gwPort,'127.0.0.1',r));
 const url=`http://127.0.0.1:${gwPort}`,tokenKey=randomBytes(32).toString('base64');
 const env={SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:serviceKey,TOKEN_ENCRYPTION_KEY:tokenKey,APP_ORIGIN:'http://localhost:3001',ALLOWED_ORIGINS:'http://localhost:3001,http://127.0.0.1:3001,http://127.0.0.1:3003',
  WHOOP_CLIENT_ID:'whoop-client',WHOOP_CLIENT_SECRET:'whoop-secret',WHOOP_CYCLES_SCOPE:'true',WHOOP_API_BASE:url+'/fake-whoop',WHOOP_SEAT_CAP:'10',
  STRIPE_WEBHOOK_SECRET:'whsec_'+randomBytes(16).toString('hex'),STRIPE_SECRET_KEY:'sk_test_local',STRIPE_API_BASE:url+'/fake-stripe',ADMIN_TASK_SECRET:randomBytes(24).toString('hex'),FN_PORT:String(fnPort),...extraEnv};
 const fn=spawn('deno',['run','--allow-net','--allow-env','--allow-read',join(here,'fn.ts')],{env:{...process.env,...env,DENO_NO_UPDATE_CHECK:'1'},stdio:['ignore','pipe','pipe']});procs.push(fn);
 let fnReady=false;fn.stdout.on('data',d=>{out(String(d));if(String(d).includes('fn ready'))fnReady=true});fn.stderr.on('data',d=>out(String(d)));
 await waitFor(async()=>(await fetch(`http://127.0.0.1:${restPort}/`)).ok);
 await waitFor(()=>fnReady,60000);
 // Calls the edge function the way the app does (supabase.functions.invoke): member token + an allowed Origin.
 async function api(token,action,payload={},{origin='http://localhost:3001'}={}){const r=await fetch(url+'/functions/v1/health-api',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,apikey:anonKey,Origin:origin},body:JSON.stringify({action,...payload})});const j=await r.json().catch(()=>({}));return {status:r.status,...j}}
 async function rest(token,path,init={}){const r=await fetch(url+'/rest/v1/'+path,{...init,headers:{apikey:anonKey,Authorization:'Bearer '+token,'Content-Type':'application/json',...(init.headers||{})}});const t=await r.text();return {status:r.status,body:t?JSON.parse(t):null}}
 async function stop(){gateway.close();for(const p of procs)p.kill('SIGTERM');try{execFileSync('pg_ctl',['-D',data,'-m','immediate','stop'],{stdio:'ignore'})}catch{}rmSync(dir,{recursive:true,force:true})}
 return {url,anonKey,serviceKey,secret,env,psql,createUser,api,rest,calls,stripeSubs,stop,pgPort,psqlArgs};
}
