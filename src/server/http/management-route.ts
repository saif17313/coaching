import {verifyActiveActor} from '@/server/http/production-read-adapter';
import {allowedBrowserMutation,safeSupabaseAuthConfig} from '@/server/browser-session.mjs';
import {STUDENT_READS,TEACHER_READS,managementFailure,parseCommand,parseRead} from '@/server/management-commands.mjs';

const headers={'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'};
const deny=(status:number,code:string)=>Response.json({success:false,error:{code}},{status,headers});
type Context={params:Promise<{action:string}>};
const bearer=(request:Request)=>{const auth=request.headers.get('authorization')??'';return /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(auth)&&auth.length<=8200?auth:null;};
const thrown=(e:unknown)=>{
 const status=e&&typeof e==='object'?Reflect.get(e,'status'):null,code=e&&typeof e==='object'?Reflect.get(e,'code'):null;
 if(typeof status==='number'&&typeof code==='string'&&[400,401,403,404].includes(status))return deny(status,code);
 return deny(status===401?401:status===403?403:503,status===401?'UNAUTHORIZED':status===403?'FORBIDDEN':'SERVICE_UNAVAILABLE');
};

/** Calls one RPC with the caller's own JWT; ok=false carries the safe failure mapping. */
export async function callRpc(auth:string,name:string,args:Record<string,unknown>):Promise<{ok:true;body:unknown}|{ok:false;status:number;code:string}>{
 const {root,key}=safeSupabaseAuthConfig(process.env);
 const response=await fetch(new URL(`/rest/v1/rpc/${name}`,root),{method:'POST',headers:{apikey:key,Authorization:auth,'Content-Type':'application/json',Accept:'application/json'},
  body:JSON.stringify(args),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
 const body:unknown=await response.json().catch(()=>null);
 if(!response.ok)return {ok:false,...managementFailure(response.status,body)};
 return {ok:true,body};
}
export {bearer,deny};

async function rpc(auth:string,name:string,args:Record<string,unknown>){
 const result=await callRpc(auth,name,args);
 return result.ok?Response.json({success:true,data:result.body},{headers}):deny(result.status,result.code);
}

/** Allow-listed read for the given role; the database enforces ownership and role again. */
export function managementRead(role:'teacher'|'student'){
 return async(request:Request,context:Context)=>{
  const auth=bearer(request);if(!auth)return deny(401,'UNAUTHORIZED');
  try{
   const {action}=await context.params;
   const {rpc:name,args}=parseRead(role==='teacher'?TEACHER_READS:STUDENT_READS,action,new URL(request.url).searchParams);
   const actor=await verifyActiveActor(auth.slice(7));if(actor.role!==role)return deny(403,role==='teacher'?'TEACHER_ONLY':'STUDENT_ONLY');
   return await rpc(auth,name,args);
  }catch(e){return thrown(e);}
 };
}

/** Teacher command: CSRF marker, idempotency key, JSON body, write gate, then one audited RPC. */
export async function managementCommand(request:Request,context:Context){
 if(!allowedBrowserMutation({method:'POST',origin:request.headers.get('origin'),url:request.url,marker:request.headers.get('x-musa-ui'),fetchSite:request.headers.get('sec-fetch-site')}))return deny(403,'CSRF_CHECK_FAILED');
 const auth=bearer(request);if(!auth)return deny(401,'UNAUTHORIZED');
 if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')||''))return deny(415,'INVALID_CONTENT_TYPE');
 if(process.env.COACHING_ENABLE_MUTATION_APIS!=='enabled-after-db-verification')return deny(503,'WRITE_SERVICE_UNAVAILABLE');
 try{
  const {action}=await context.params;
  const raw=await request.text();if(raw.length>12000)return deny(413,'BODY_TOO_LARGE');
  let body:unknown;try{body=JSON.parse(raw);}catch{return deny(400,'INVALID_INPUT');}
  const {rpc:name,args}=parseCommand(action,body,request.headers.get('idempotency-key')??'');
  const actor=await verifyActiveActor(auth.slice(7));if(actor.role!=='teacher')return deny(403,'TEACHER_ONLY');
  return await rpc(auth,name,args);
 }catch(e){return thrown(e);}
}
