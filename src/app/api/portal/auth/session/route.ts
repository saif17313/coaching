import {NextRequest,NextResponse} from 'next/server';
import {verifyActiveActor} from '@/server/http/production-read-adapter';
import {COOKIE_NAME,validAccessToken} from '@/server/browser-session.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const token=request.cookies.get(COOKIE_NAME)?.value;
 if(!validAccessToken(token))return NextResponse.json({success:false,error:{code:'NOT_SIGNED_IN'}},{status:401,headers:{'Cache-Control':'no-store'}});
 try{
  const actor=await verifyActiveActor(token);
  return NextResponse.json({success:true,data:{role:actor.role,userId:actor.userId}},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({success:false,error:{code:'SESSION_EXPIRED'}},{status:401,headers:{'Cache-Control':'no-store'}});}
}
