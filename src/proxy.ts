import {NextRequest,NextResponse} from 'next/server';
import {COOKIE_NAME,allowedBrowserMutation,validAccessToken} from './server/browser-session.mjs';

/** Existing bearer clients retain their explicit header. Browser cookie is read only here. */
export function proxy(req:NextRequest){
 const token=req.cookies.get(COOKIE_NAME)?.value;
 if(!validAccessToken(token)||req.headers.has('authorization'))return NextResponse.next();
 if(!allowedBrowserMutation({method:req.method,origin:req.headers.get('origin'),url:req.url,marker:req.headers.get('x-musa-ui'),fetchSite:req.headers.get('sec-fetch-site')})){
  return NextResponse.json({success:false,error:{code:'CSRF_CHECK_FAILED'}},{status:403,headers:{'Cache-Control':'no-store'}});
 }
 const headers=new Headers(req.headers);
 headers.set('authorization',`Bearer ${token}`);
 headers.delete('cookie'); // Downstream handlers only require verified bearer; do not forward cookie.
 return NextResponse.next({request:{headers}});
}
export const config={matcher:['/api/v1/teacher/:path*','/api/v1/student/:path*']};
