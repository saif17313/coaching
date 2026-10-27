import {verifyActiveActor} from '@/server/http/production-read-adapter';
import {allowedBrowserMutation,safeSupabaseAuthConfig} from '@/server/browser-session.mjs';
import {authAdminHeaders} from '@/server/auth-admin-headers.mjs';
import {isUuid,rpcFailure,validLinkedAuthUser,validLoginEmail} from '@/server/student-login-link.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const deny=(status:number,code:string)=>Response.json({success:false,error:{code}},{status,headers});
type Context={params:Promise<{studentId:string}>};
type LoginState={studentId:string;state:'none'|'reserved'|'invited'|'linked';email:string};
const bearer=(request:Request)=>{const auth=request.headers.get('authorization')??'';return /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(auth)&&auth.length<=8200?auth:null;};
const failed=(e:unknown)=>{const status=e&&typeof e==='object'&&'status' in e?Reflect.get(e,'status'):null;return deny(status===401?401:status===403?403:503,status===401?'UNAUTHORIZED':status===403?'FORBIDDEN':'AUTH_UNAVAILABLE');};

async function rpc(root:URL|string,key:string,auth:string,name:string,args:Record<string,unknown>){
 const response=await fetch(new URL(`/rest/v1/rpc/${name}`,root),{method:'POST',headers:{apikey:key,Authorization:auth,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(args),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
 return {response,body:await response.json().catch(()=>null) as unknown};
}

/** Teacher reads whether an offline Student has a portal login yet. */
export async function GET(request:Request,context:Context){
 const auth=bearer(request);if(!auth)return deny(401,'UNAUTHORIZED');
 const {studentId}=await context.params;if(!isUuid(studentId))return deny(400,'INVALID_STUDENT_ID');
 try{
  const actor=await verifyActiveActor(auth.slice(7));if(actor.role!=='teacher')return deny(403,'TEACHER_ONLY');
  const {root,key}=safeSupabaseAuthConfig(process.env);
  const {response,body}=await rpc(root,key,auth,'coaching_student_login_state',{p_student_id:studentId});
  if(!response.ok){const failure=rpcFailure(response.status,body);return deny(failure.status,failure.code);}
  return Response.json({success:true,data:body},{headers});
 }catch(e){return failed(e);}
}

/**
 * Activates portal access for an existing (usually offline) Student. The Auth user is created
 * with the Student's permanent id, so every enrollment, payment, receipt and result already
 * belongs to it; nothing is copied or re-pointed. The Student verifies the email and chooses a
 * password through the standard invitation link. Retrying resends the invitation only while the
 * same email is still unverified.
 */
export async function POST(request:Request,context:Context){
 if(!allowedBrowserMutation({method:'POST',origin:request.headers.get('origin'),url:request.url,marker:request.headers.get('x-musa-ui'),fetchSite:request.headers.get('sec-fetch-site')}))return deny(403,'CSRF_CHECK_FAILED');
 const auth=bearer(request),operation=request.headers.get('idempotency-key')??'';
 if(!auth)return deny(401,'UNAUTHORIZED');
 if(!isUuid(operation))return deny(400,'INVALID_OPERATION_ID');
 if(request.headers.get('content-type')!=='application/json')return deny(415,'INVALID_CONTENT_TYPE');
 const {studentId}=await context.params;if(!isUuid(studentId))return deny(400,'INVALID_STUDENT_ID');
 try{
  const actor=await verifyActiveActor(auth.slice(7));if(actor.role!=='teacher')return deny(403,'TEACHER_ONLY');
  if(process.env.COACHING_ENABLE_MUTATION_APIS!=='enabled-after-db-verification')return deny(503,'MUTATIONS_DISABLED');
  const admin=authAdminHeaders(process.env.SUPABASE_AUTH_ADMIN_KEY);if(!admin)return deny(503,'AUTH_ADMIN_NOT_CONFIGURED');
  const raw=await request.text();if(raw.length>400)return deny(413,'BODY_TOO_LARGE');
  let input:unknown;try{input=JSON.parse(raw);}catch{return deny(400,'INVALID_LOGIN_EMAIL');}
  if(!validLoginEmail(input))return deny(400,'INVALID_LOGIN_EMAIL');
  const email=input.email.trim().toLowerCase();
  const portalOrigin=process.env.NODE_ENV==='development'?'http://localhost:3000':process.env.COACHING_PORTAL_ORIGIN;
  if(!portalOrigin||!/^https?:\/\/[^/]+$/.test(portalOrigin)||process.env.NODE_ENV!=='development'&&!portalOrigin.startsWith('https://'))return deny(503,'PORTAL_ORIGIN_NOT_CONFIGURED');
  const {root,key}=safeSupabaseAuthConfig(process.env);

  // 1. Reserve the email for this Student (Teacher JWT; the database checks ownership and duplicates).
  const prepared=await rpc(root,key,auth,'coaching_prepare_student_login',{p_student_id:studentId,p_email:email,p_operation_id:operation});
  if(!prepared.response.ok){
   const failure=rpcFailure(prepared.response.status,prepared.body);
   if(failure.code!=='STUDENT_ALREADY_HAS_LOGIN')return deny(failure.status,failure.code);
   // A previous attempt created the Auth user; only an unverified, identical email may be re-invited.
   const state=await rpc(root,key,auth,'coaching_student_login_state',{p_student_id:studentId});
   const current=state.body as LoginState|null;
   if(!state.response.ok||current?.state!=='invited'||current.email.toLowerCase()!==email)return deny(409,current?.state==='linked'?'STUDENT_ALREADY_HAS_LOGIN':'LOGIN_EMAIL_MISMATCH');
  }else{
   // 2. Create the Auth user with the permanent Student id. Unconfirmed until the Student verifies.
   const created=await fetch(new URL('/auth/v1/admin/users',root),{method:'POST',headers:admin,body:JSON.stringify({id:studentId,email,email_confirm:false}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
   const user:unknown=await created.json().catch(()=>null);
   if(!created.ok)return deny(created.status===422||created.status===400?409:503,created.status===422||created.status===400?'AUTH_ACCOUNT_REJECTED':'AUTH_UNAVAILABLE');
   if(!validLinkedAuthUser(user,studentId,email))return deny(502,'AUTH_LINK_UNCONFIRMED');
  }
  // 3. Send the standard invitation (verification + password choice) to the same unverified user.
  const inviteUrl=new URL('/auth/v1/invite',root);inviteUrl.searchParams.set('redirect_to',portalOrigin+'/portal/accept-invite');
  const invited=await fetch(inviteUrl,{method:'POST',headers:admin,body:JSON.stringify({email}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
  const invitedUser:unknown=await invited.json().catch(()=>null);
  if(!invited.ok)return deny(invited.status===429?429:409,invited.status===429?'AUTH_RATE_LIMIT':'AUTH_INVITATION_REJECTED');
  if(!validLinkedAuthUser(invitedUser,studentId,email))return deny(502,'AUTH_LINK_UNCONFIRMED');
  return Response.json({success:true,data:{studentId,state:'invited',email}},{status:202,headers});
 }catch(e){return failed(e);}
}
