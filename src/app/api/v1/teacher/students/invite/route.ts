import {verifyActiveActor} from '@/server/http/production-read-adapter';
import {allowedBrowserMutation,safeSupabaseAuthConfig} from '@/server/browser-session.mjs';
import {readSupabaseRows} from '@/server/supabase/rest';
import {authAdminHeaders} from '@/server/auth-admin-headers.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const deny=(status:number,code:string)=>Response.json({success:false,error:{code}},{status,headers});
/** Privileged Auth capability only. All profile reads/writes still use Teacher JWT and RPC. */
export async function POST(request:Request){
 if(!allowedBrowserMutation({method:'POST',origin:request.headers.get('origin'),url:request.url,marker:request.headers.get('x-musa-ui'),fetchSite:request.headers.get('sec-fetch-site')}))return deny(403,'CSRF_CHECK_FAILED');
 const auth=request.headers.get('authorization')??'',operation=request.headers.get('idempotency-key')??'';
 if(!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(auth)||auth.length>8200)return deny(401,'UNAUTHORIZED');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operation))return deny(400,'INVALID_OPERATION_ID');
 if(request.headers.get('content-type')!=='application/json')return deny(415,'INVALID_CONTENT_TYPE');
 try{
  const actor=await verifyActiveActor(auth.slice(7));if(actor.role!=='teacher')return deny(403,'TEACHER_ONLY');
  if(process.env.COACHING_ENABLE_MUTATION_APIS!=='enabled-after-db-verification')return deny(503,'MUTATIONS_DISABLED');
  const secret=process.env.SUPABASE_AUTH_ADMIN_KEY;
  const inviteHeaders=authAdminHeaders(secret);if(!inviteHeaders)return deny(503,'AUTH_ADMIN_NOT_CONFIGURED');
  const raw=await request.text();if(raw.length>600)return deny(413,'BODY_TOO_LARGE');
  let input;try{input=JSON.parse(raw);}catch{return deny(400,'INVALID_ONBOARD_INPUT');}
  if(!input||Object.keys(input).sort().join(',')!=='email,fullName'||typeof input.email!=='string'||input.email.length>254||!/^\S+@\S+\.\S+$/.test(input.email)||typeof input.fullName!=='string'||input.fullName.trim().length<2||input.fullName.length>160||/[\x00-\x1f\x7f]/.test(input.fullName))return deny(400,'INVALID_ONBOARD_INPUT');
  const {root,key}=safeSupabaseAuthConfig(process.env);
  const identity=await fetch(new URL('/rest/v1/rpc/coaching_teacher_student_identity',root),{method:'POST',headers:{apikey:key,Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify({p_email:input.email.trim().toLowerCase()}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});if(!identity.ok)return deny(503,'IDENTITY_CHECK_UNAVAILABLE');const existing=await identity.json();if(existing.state!=='available')return deny(409,existing.state==='existing'?'STUDENT_ALREADY_EXISTS':'ACCOUNT_ROLE_CONFLICT');
  const portalOrigin=process.env.NODE_ENV==='development'?'http://localhost:3000':process.env.COACHING_PORTAL_ORIGIN;
  if(!portalOrigin||!/^https?:\/\/[^/]+$/.test(portalOrigin)||process.env.NODE_ENV!=='development'&&!portalOrigin.startsWith('https://'))return deny(503,'PORTAL_ORIGIN_NOT_CONFIGURED');
  const inviteUrl=new URL('/auth/v1/invite',root);inviteUrl.searchParams.set('redirect_to',portalOrigin+'/portal/accept-invite');
  const response=await fetch(inviteUrl,{method:'POST',headers:inviteHeaders,body:JSON.stringify({email:input.email.toLowerCase(),data:{full_name:input.fullName.trim()}}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok)return deny(response.status===429?429:response.status===400||response.status===422?409:503,response.status===429?'AUTH_RATE_LIMIT':response.status===400||response.status===422?'AUTH_INVITATION_REJECTED':'AUTH_UNAVAILABLE');
  const user=await response.json();
  if(typeof user?.id!=='string'||!/^[-a-f0-9]{36}$/i.test(user.id)||typeof user.email!=='string'||user.email.toLowerCase()!==input.email.toLowerCase())return deny(502,'AUTH_INVITATION_UNCONFIRMED');
  const profiles=await readSupabaseRows<{id:string;role:string;account_status:string}>('profiles',auth.slice(7),{select:'id,role,account_status',id:`eq.${user.id}`,limit:'1'});
  if(profiles.length!==1||profiles[0]?.role!=='student'||profiles[0]?.account_status!=='pending')return deny(502,'INVITED_PROFILE_REQUIRES_REVIEW');
  const named=await fetch(new URL('/rest/v1/rpc/coaching_update_student_profile',root),{method:'POST',headers:{apikey:key,Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify({p_student_id:user.id,p_full_name:input.fullName.trim(),p_operation_id:operation}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
  let nameSaved=false;
  if(named.ok){const rows=await readSupabaseRows<{id:string;full_name:string}>('profiles',auth.slice(7),{select:'id,full_name',id:`eq.${user.id}`,limit:'1'});nameSaved=rows.length===1&&rows[0]?.full_name===input.fullName.trim();}
  return Response.json({success:true,data:{studentId:user.id,state:'pending',nameSaved,message:nameSaved?'Invitation accepted by Supabase Auth. The student must confirm email; Teacher approval and enrollment remain required.':'Invitation accepted, but the profile name needs Teacher review. Confirm email, then approve and enroll.'}},{status:nameSaved?201:202,headers});
 }catch(e){const status=e&&typeof e==='object'&&'status' in e?Reflect.get(e,'status'):null;return deny(status===401?401:status===403?403:503,status===401?'UNAUTHORIZED':status===403?'FORBIDDEN':'AUTH_UNAVAILABLE');}
}
