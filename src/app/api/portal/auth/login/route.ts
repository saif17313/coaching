import {NextRequest,NextResponse} from 'next/server';
import {verifyActiveActor} from '@/server/http/production-read-adapter';
import {COOKIE_NAME,allowedBrowserMutation,safeSupabaseAuthConfig,validAccessToken,verifyLoginBody} from '@/server/browser-session.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const deny=(status:number,code:string)=>NextResponse.json({success:false,error:{code}},{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:NextRequest){
 if(!allowedBrowserMutation({method:'POST',origin:request.headers.get('origin'),url:request.url,marker:request.headers.get('x-musa-ui'),fetchSite:request.headers.get('sec-fetch-site')}))return deny(403,'CSRF_CHECK_FAILED');
 if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')||''))return deny(415,'INVALID_CONTENT_TYPE');
 let input:unknown;
 try{const text=await request.text();if(text.length>1024)return deny(413,'BODY_TOO_LARGE');input=JSON.parse(text);}catch{return deny(400,'INVALID_CREDENTIALS');}
 if(!verifyLoginBody(input))return deny(400,'INVALID_CREDENTIALS');
 try{
  const {root,key}=safeSupabaseAuthConfig(process.env);
  const res=await fetch(new URL('/auth/v1/token?grant_type=password',root),{method:'POST',headers:{apikey:key,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(input),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!res.ok)return deny(res.status===400||res.status===401?401:503,res.status===400||res.status===401?'INVALID_CREDENTIALS':'AUTH_UNAVAILABLE');
  const payload:unknown=await res.json();
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return deny(503,'AUTH_UNAVAILABLE');
  const token=Reflect.get(payload,'access_token');const expires=Reflect.get(payload,'expires_in');
  if(!validAccessToken(token)||!Number.isSafeInteger(expires)||expires<30||expires>86400)return deny(503,'AUTH_UNAVAILABLE');
  const actor=await verifyActiveActor(token); // Signed Auth identity + active DB role (not role from /token response).
  const result=NextResponse.json({success:true,data:{role:actor.role,userId:actor.userId,expiresIn:Math.min(expires,3600)}},{headers:{'Cache-Control':'no-store'}});
  result.cookies.set(COOKIE_NAME,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:Math.min(expires,3600)});
  return result;
 }catch(e){const status=e&&typeof e==='object'&&'status' in e?Reflect.get(e,'status'):null;return status===403?deny(403,'ACCOUNT_NOT_ACTIVE'):status===401?deny(401,'INVALID_CREDENTIALS'):deny(503,'AUTH_UNAVAILABLE');}
}
