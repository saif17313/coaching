import {NextRequest,NextResponse} from 'next/server';
import {verifyActiveActor} from '@/server/http/production-read-adapter';
import {allowedBrowserMutation,safeSupabaseAuthConfig} from '@/server/browser-session.mjs';
import {validSignupResult,validStudentOnboard,signupFailure} from '@/server/student-onboard.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const deny=(status:number,code:string)=>NextResponse.json({success:false,error:{code}},{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:NextRequest){
 if(!allowedBrowserMutation({method:'POST',origin:request.headers.get('origin'),url:request.url,marker:request.headers.get('x-musa-ui'),fetchSite:request.headers.get('sec-fetch-site')}))return deny(403,'CSRF_CHECK_FAILED');
 if(process.env.COACHING_ENABLE_MUTATION_APIS!=='enabled-after-db-verification')return deny(503,'WRITE_SERVICE_UNAVAILABLE');
 if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')||''))return deny(415,'INVALID_CONTENT_TYPE');
 const auth=request.headers.get('authorization')||'';
 if(!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(auth)||auth.length>8200)return deny(401,'UNAUTHORIZED');
 let input:unknown;
 try {const text=await request.text();if(text.length>900)return deny(413,'BODY_TOO_LARGE');input=JSON.parse(text);}catch{return deny(400,'INVALID_ONBOARD_INPUT');}
 if(!validStudentOnboard(input))return deny(400,'INVALID_ONBOARD_INPUT');
 try{
  const actor=await verifyActiveActor(auth.slice(7));
  if(actor.role!=='teacher')return deny(403,'TEACHER_ONLY');
  const {root,key}=safeSupabaseAuthConfig(process.env);
  // A publishable API key is sufficient for signup; NEVER use service-role or client-selected roles.
  const {email,fullName,initialPassword}=input as {email:string;fullName:string;initialPassword:string};
  const response=await fetch(new URL('/auth/v1/signup',root),{
   method:'POST',headers:{apikey:key,'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify({email,password:initialPassword,data:{full_name:fullName}}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)
  });
  if(!response.ok){const failure=signupFailure(response.status,await response.json().catch(()=>null));return deny(failure.status,failure.code);}
  const payload:unknown=await response.json();
  if(!validSignupResult(payload,email))return deny(409,'STUDENT_ALREADY_EXISTS_OR_UNCONFIRMED');
  // Existing auth.users signup trigger creates student/pending; no teacher privilege is assigned.
  // Set the name only through the existing audited teacher-only RPC, with the same verified JWT.
  const user=payload&&typeof payload==='object'?(Reflect.get(payload,'user')??payload):null;
  const studentId=Reflect.get(user as object,'id') as string;
  let named=false;
  try{
   const rpc=await fetch(new URL('/rest/v1/rpc/coaching_update_student_profile',root),{
    method:'POST',headers:{apikey:key,Authorization:auth,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({p_student_id:studentId,p_full_name:fullName,p_operation_id:crypto.randomUUID()}),
    cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)
   });
   if(rpc.ok){const data:unknown=await rpc.json();named=!!data&&typeof data==='object'&&!Array.isArray(data)&&Reflect.get(data,'id')===studentId&&Reflect.get(data,'fullName')===fullName;}
  }catch{named=false;}
  return NextResponse.json({success:true,data:{state:'pending',nameSaved:named,message:named?'Student account and profile created. Await email confirmation, then activate and enroll.':'Student Auth created but profile name needs Teacher -> Students -> Edit profile. Confirm email before login.'}},{status:named?201:202,headers:{'Cache-Control':'no-store'}});
 }catch{return deny(503,'AUTH_UNAVAILABLE');}
}
