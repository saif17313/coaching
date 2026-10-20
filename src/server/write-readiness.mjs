/** Nonsecret server-process write readiness. Never treats an HTTP GET as a write authorization. */
export function cmsWriteReadiness(env) {
  const enabled=env?.COACHING_ENABLE_MUTATION_APIS==='enabled-after-db-verification';
  return Object.freeze({
    writable:enabled,
    mutationVerified:false,
    runtime:env?.NODE_ENV==='development'?'local-development':'deployment',
    scope:'active-teacher-jwt-and-supabase-rls',
    detail:enabled?'Write gate enabled; all mutations still require verified teacher authorization, CSRF, idempotency and DB RLS.':'Write gate OFF in the running server process. Restart using the guarded EduCentre DEV write launcher; changing another terminal does not update this server.',
  });
}

/** A read probe proves connectivity only. It never attempts a cloud mutation. */
export function createWriteStatusRoute({verify,probe,env}){
 return async(req)=>{
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  const send=(status,value)=>Response.json(value,{status,headers});
  const token=/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(req.headers.get('authorization')??'')?.[1];
  if(!token||token.length>8192)return send(401,{success:false,error:{code:'UNAUTHORIZED'}});
  try{
   const actor=await verify(token);
   if(actor?.verified!==true||actor.role!=='teacher'||actor.accountStatus!=='active')return send(403,{success:false,error:{code:'FORBIDDEN'}});
   const status=cmsWriteReadiness(env);
   if(!status.writable)return send(200,{success:true,data:{...status,backend:'not-checked'}});
   await probe(token);
   return send(200,{success:true,data:{...status,backend:'reachable'}});
  }catch(e){
   const status=[401,403].includes(e?.status)?e.status:503;
   return send(status,{success:false,error:{code:status===401?'UNAUTHORIZED':status===403?'FORBIDDEN':'CMS_SERVICE_UNAVAILABLE'}});
  }
 };
}
