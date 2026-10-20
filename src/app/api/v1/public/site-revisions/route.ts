import {callCms} from '@/server/http/production-cms-core';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(new URL(request.url).search)return Response.json({success:false,error:{code:'INVALID_QUERY'}},{status:400,headers});
 try{
  const data=await callCms('coaching_cms_public_fingerprint',null,{});
  if(!data||typeof data!=='object'||Object.keys(data).sort().join(',')!=='fingerprint,pages,settingsRevision'||!/^[0-9a-f]{32}$/.test(String(Reflect.get(data,'fingerprint'))))throw Error('INVALID_FINGERPRINT');
  const pages=Reflect.get(data,'pages'),revision=Reflect.get(data,'settingsRevision');
  if(!pages||typeof pages!=='object'||Array.isArray(pages)||Object.keys(pages).length>50||Object.entries(pages).some(([slug,value])=>!/^[a-z][a-z0-9-]{1,62}$/.test(slug)||!Number.isSafeInteger(value)||(value as number)<1)||revision!==null&&(!Number.isSafeInteger(revision)||revision<1))throw Error('INVALID_FINGERPRINT');
  return Response.json({success:true,data},{headers});
 }catch{return Response.json({success:false,error:{code:'CMS_SERVICE_UNAVAILABLE'}},{status:503,headers});}
}
