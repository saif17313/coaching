/** Teacher Overview: framework-free, JWT-verified, RLS-scoped count gateway. */
const TOKEN=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const METRICS=Object.freeze([
  ['studentsTotal','profiles','students-total'],
  ['studentsActive','profiles','students-active'],
  ['studentsPending','profiles','students-pending'],
  ['batchesOpen','batches','batches-open'],
  ['enrollmentsPending','enrollments','enrollments-pending'],
  ['enrollmentsActive','enrollments','enrollments-active'],
]);
const fail=(status,code)=>{const error=new Error(code);error.status=status;error.code=code;throw error;};
const json=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
export function createTeacherOverviewEndpoint({verify,countRows}={}){
  if(typeof verify!=='function'||typeof countRows!=='function')throw Error('Invalid overview ports');
  return async function GET(request){
    try{
      if(!(request instanceof Request)||request.method!=='GET')fail(405,'METHOD_NOT_ALLOWED');
      if([...new URL(request.url).searchParams.keys()].length)fail(400,'INVALID_QUERY');
      const header=request.headers.get('authorization');
      const match=header&&/^Bearer ([^\s,]+)$/.exec(header);
      if(!match||match[1].length>8192||!TOKEN.test(match[1]))fail(401,'UNAUTHORIZED');
      const token=match[1];
      const actor=await verify(token);
      if(!actor||actor.verified!==true||!UUID.test(actor.userId)||actor.accessToken!==token||actor.accountStatus!=='active')fail(401,'UNAUTHORIZED');
      if(actor.role!=='teacher')fail(403,'FORBIDDEN');
      const output=Object.create(null);
      // Fixed allowlisted metrics; no client-controlled table, filter, or SQL input.
      const counts=await Promise.all(METRICS.map(async([field,table,filter])=>{
        const count=await countRows(table,token,filter);
        if(!Number.isSafeInteger(count)||count<0)fail(502,'UPSTREAM_DATA_INVALID');
        return [field,count];
      }));
      for(const [field,count] of counts)output[field]=count;
      return json(200,{success:true,data:output});
    }catch(error){
      if(error?.code&&[400,401,403,405,502].includes(error.status))return json(error.status,{success:false,error:{code:error.code,message:error.code}});
      return json(503,{success:false,error:{code:'SERVICE_UNAVAILABLE',message:'SERVICE_UNAVAILABLE'}});
    }
  };
}
