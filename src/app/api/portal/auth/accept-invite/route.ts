import {allowedBrowserMutation,safeSupabaseAuthConfig,validAccessToken} from '@/server/browser-session.mjs';
import {verifySupabaseUser} from '@/server/http/supabase-read-auth.mjs';
import {readSupabaseRows} from '@/server/supabase/rest';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const deny=(status:number,code:string)=>Response.json({success:false,error:{code}},{status,headers});
export async function POST(request:Request){
 if(!allowedBrowserMutation({method:'POST',origin:request.headers.get('origin'),url:request.url,marker:request.headers.get('x-musa-ui'),fetchSite:request.headers.get('sec-fetch-site')}))return deny(403,'CSRF_CHECK_FAILED');
 if(request.headers.get('content-type')!=='application/json')return deny(415,'INVALID_CONTENT_TYPE');
 try{
  const raw=await request.text();if(raw.length>10000)return deny(413,'BODY_TOO_LARGE');
  let input;try{input=JSON.parse(raw);}catch{return deny(400,'INVALID_INPUT');}
  if(!input||Object.keys(input).sort().join(',')!=='accessToken,password'||!validAccessToken(input.accessToken)||typeof input.password!=='string'||input.password.length<12||input.password.length>128||!/[A-Z]/.test(input.password)||!/[a-z]/.test(input.password)||!/[0-9]/.test(input.password)||!(/[^A-Za-z0-9]/.test(input.password)))return deny(400,'INVALID_INPUT');
  const {root,key}=safeSupabaseAuthConfig(process.env);
  const identity=await verifySupabaseUser(input.accessToken,{projectUrl:root.origin,anonKey:key});if(!identity)return deny(401,'INVITATION_EXPIRED');
  const rows=await readSupabaseRows<{id:string;role:string;account_status:string}>('profiles',input.accessToken,{select:'id,role,account_status',id:`eq.${identity.id}`,limit:'1'});
  if(rows.length!==1||rows[0]?.role!=='student'||!['pending','active'].includes(rows[0]?.account_status))return deny(403,'STUDENT_ACCOUNT_REQUIRED');
  const response=await fetch(new URL('/auth/v1/user',root),{method:'PUT',headers:{apikey:key,Authorization:`Bearer ${input.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({password:input.password}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok)return deny(response.status===401?401:response.status===422?400:503,response.status===401?'INVITATION_EXPIRED':response.status===422?'PASSWORD_POLICY_REJECTED':'AUTH_UNAVAILABLE');
  const value=await response.json();if(value?.id!==identity.id)return deny(502,'AUTH_UPDATE_UNCONFIRMED');
  return Response.json({success:true,data:{state:rows[0].account_status,message:rows[0].account_status==='pending'?'Password saved. Your Teacher must approve and enroll your account before you can sign in.':'Password saved. You can now sign in to the Student portal.'}},{headers});
 }catch{return deny(503,'AUTH_UNAVAILABLE');}
}
