import {verifyActiveActor} from '@/server/http/production-read-adapter';
import {allowedBrowserMutation,safeSupabaseAuthConfig} from '@/server/browser-session.mjs';
import {authAdminHeaders} from '@/server/auth-admin-headers.mjs';
import {readSupabaseRows} from '@/server/supabase/rest';
import {admissionId} from '@/client/student-admission.mjs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const fail=(status:number,code:string)=>Response.json({success:false,error:{code}},{status,headers});
export async function POST(request:Request){try{
 if(!allowedBrowserMutation({method:request.method,origin:request.headers.get('origin'),url:request.url,marker:request.headers.get('x-musa-ui'),fetchSite:request.headers.get('sec-fetch-site')}))return fail(403,'CSRF_CHECK_FAILED');
 const token=/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(request.headers.get('authorization')??'')?.[1];if(!token)return fail(401,'UNAUTHORIZED');
 const actor=await verifyActiveActor(token);if(actor.role!=='teacher')return fail(403,'FORBIDDEN');
 if(process.env.COACHING_ENABLE_MUTATION_APIS!=='enabled-after-db-verification')return fail(503,'MUTATIONS_DISABLED');
 const id=/\/students\/([^/]+)\/resend-invite$/.exec(new URL(request.url).pathname)?.[1];if(!admissionId(id)||!admissionId(request.headers.get('idempotency-key')))return fail(400,'INVALID_INPUT');
 const profiles=await readSupabaseRows<{id:string;role:string;account_status:string}>('profiles',token,{select:'id,role,account_status',id:`eq.${id}`,limit:'1'});if(profiles.length!==1||profiles[0].role!=='student'||profiles[0].account_status!=='pending')return fail(409,'STUDENT_INVITATION_NOT_PENDING');
 const privileged=authAdminHeaders(process.env.SUPABASE_AUTH_ADMIN_KEY);if(!privileged)return fail(503,'AUTH_ADMIN_NOT_CONFIGURED');const {root}=safeSupabaseAuthConfig(process.env);
 const response=await fetch(new URL('/auth/v1/admin/users/'+id,root),{headers:privileged,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});if(!response.ok)return fail(503,'AUTH_INVITATION_UNAVAILABLE');const user=await response.json();
 if(user.id!==id||typeof user.email!=='string'||user.email_confirmed_at)return fail(409,'STUDENT_EMAIL_ALREADY_CONFIRMED');
 if(user.invited_at&&Date.now()-Date.parse(user.invited_at)<300000)return fail(409,'INVITATION_COOLDOWN');
 const origin=process.env.NODE_ENV==='development'?'http://localhost:3000':process.env.COACHING_PORTAL_ORIGIN;if(!origin||!/^https?:\/\/[^/]+$/.test(origin)||process.env.NODE_ENV!=='development'&&!origin.startsWith('https://'))return fail(503,'PORTAL_ORIGIN_NOT_CONFIGURED');
 const url=new URL('/auth/v1/invite',root);url.searchParams.set('redirect_to',origin+'/portal/accept-invite');const invited=await fetch(url,{method:'POST',headers:privileged,body:JSON.stringify({email:user.email}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});if(!invited.ok)return fail(409,'AUTH_INVITATION_REJECTED');const receipt=await invited.json();if(receipt.id!==id)return fail(502,'INVITED_IDENTITY_MISMATCH');
 return Response.json({success:true,data:{studentId:id,message:'Supabase Auth accepted the invitation resend. Confirmation and account approval remain required.'}},{headers});
}catch{return fail(503,'AUTH_INVITATION_UNAVAILABLE');}}
