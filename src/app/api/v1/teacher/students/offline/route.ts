import {verifyActiveActor} from '@/server/http/production-read-adapter';
import {allowedBrowserMutation,safeSupabaseAuthConfig} from '@/server/browser-session.mjs';
import {rpcFailure,validOfflineStudent} from '@/server/student-login-link.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const deny=(status:number,code:string)=>Response.json({success:false,error:{code}},{status,headers});
const OPERATION=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Offline admission: creates the permanent Student identity with no Auth account, email or password. */
export async function POST(request:Request){
 if(!allowedBrowserMutation({method:'POST',origin:request.headers.get('origin'),url:request.url,marker:request.headers.get('x-musa-ui'),fetchSite:request.headers.get('sec-fetch-site')}))return deny(403,'CSRF_CHECK_FAILED');
 const auth=request.headers.get('authorization')??'',operation=request.headers.get('idempotency-key')??'';
 if(!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(auth)||auth.length>8200)return deny(401,'UNAUTHORIZED');
 if(!OPERATION.test(operation))return deny(400,'INVALID_OPERATION_ID');
 if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')||''))return deny(415,'INVALID_CONTENT_TYPE');
 if(process.env.COACHING_ENABLE_MUTATION_APIS!=='enabled-after-db-verification')return deny(503,'WRITE_SERVICE_UNAVAILABLE');
 const raw=await request.text();if(raw.length>400)return deny(413,'BODY_TOO_LARGE');
 let input:unknown;try{input=JSON.parse(raw);}catch{return deny(400,'INVALID_STUDENT');}
 if(!validOfflineStudent(input))return deny(400,'INVALID_STUDENT');
 try{
  const actor=await verifyActiveActor(auth.slice(7));if(actor.role!=='teacher')return deny(403,'TEACHER_ONLY');
  const {root,key}=safeSupabaseAuthConfig(process.env);
  const response=await fetch(new URL('/rest/v1/rpc/coaching_create_offline_student',root),{method:'POST',headers:{apikey:key,Authorization:auth,'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify({p_full_name:input.fullName.trim(),p_operation_id:operation}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
  const body:unknown=await response.json().catch(()=>null);
  if(!response.ok){const failure=rpcFailure(response.status,body);return deny(failure.status,failure.code);}
  const id=body&&typeof body==='object'?Reflect.get(body,'id'):null;
  if(typeof id!=='string'||!OPERATION.test(id))return deny(502,'STUDENT_CREATION_UNCONFIRMED');
  return Response.json({success:true,data:{studentId:id,login:'none'}},{status:201,headers});
 }catch(e){const status=e&&typeof e==='object'&&'status' in e?Reflect.get(e,'status'):null;return deny(status===401?401:status===403?403:503,status===401?'UNAUTHORIZED':status===403?'FORBIDDEN':'WRITE_SERVICE_UNAVAILABLE');}
}
