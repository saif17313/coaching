import {NextRequest,NextResponse} from 'next/server';
import {COOKIE_NAME,allowedBrowserMutation} from '@/server/browser-session.mjs';
export const runtime='nodejs';
export async function POST(request:NextRequest){
 if(!allowedBrowserMutation({method:'POST',origin:request.headers.get('origin'),url:request.url,marker:request.headers.get('x-musa-ui'),fetchSite:request.headers.get('sec-fetch-site')})){
  return NextResponse.json({success:false,error:{code:'CSRF_CHECK_FAILED'}},{status:403,headers:{'Cache-Control':'no-store'}});
 }
 const result=NextResponse.json({success:true},{headers:{'Cache-Control':'no-store'}});
 result.cookies.set(COOKIE_NAME,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:0});
 return result;
}
