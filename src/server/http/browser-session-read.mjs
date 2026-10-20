import {validAccessToken} from '../browser-session.mjs';
/** A temporary Auth/DB failure must not be reported as an expired session. */
export function createBrowserSessionRead({verify,tokenOf}){
 return async request=>{
  const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'},send=(status,body)=>Response.json(body,{status,headers});
  if(request.method!=='GET')return send(405,{success:false,error:{code:'METHOD_NOT_ALLOWED'}});
  const token=tokenOf(request);if(!validAccessToken(token))return send(401,{success:false,error:{code:'NOT_SIGNED_IN'}});
  try{
   const actor=await verify(token);
   if(actor?.verified!==true||!['teacher','student'].includes(actor.role)||actor.accountStatus!=='active'||typeof actor.userId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actor.userId))throw Error('INVALID_ACTOR');
   return send(200,{success:true,data:{role:actor.role,userId:actor.userId}});
  }catch(error){
   const status=error?.httpStatus??error?.status;
   if(status===401)return send(401,{success:false,error:{code:'SESSION_EXPIRED'}});
   if(status===403)return send(403,{success:false,error:{code:'ACCOUNT_ACCESS_DENIED'}});
   return send(503,{success:false,error:{code:'SESSION_SERVICE_UNAVAILABLE'}});
  }
 };
}
