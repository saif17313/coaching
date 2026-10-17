/** Strict verified teacher-only HTTP boundary for student profile and enrollment request commands. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const isUUID=x=>typeof x==='string'&&UUID.test(x);
const deny=(status,code)=>{const e=new Error(code);e.status=status;e.code=code;throw e;};
const respond=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
function tokenFrom(req){
 const raw=req.headers.get('authorization'),m=raw&&/^Bearer ([^\s,]+)$/.exec(raw);
 if(!m||m[1].length>8192||!TOKEN.test(m[1]))deny(401,'UNAUTHORIZED');
 return m[1];
}
function operationFrom(req){const op=req.headers.get('idempotency-key');if(!isUUID(op))deny(400,'INVALID_IDEMPOTENCY_KEY');return op;}
async function bodyFrom(req){
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers.get('content-type')??''))deny(415,'UNSUPPORTED_MEDIA_TYPE');
 const len=req.headers.get('content-length');if(len!==null&&(!/^\d+$/.test(len)||Number(len)>4096))deny(413,'BODY_TOO_LARGE');
 if(!req.body)deny(400,'INVALID_BODY');
 const reader=req.body.getReader();const chunks=[];let count=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>4096)deny(413,'BODY_TOO_LARGE');chunks.push(value);}}finally{reader.releaseLock();}
 try{const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 catch{deny(400,'INVALID_JSON');}
}
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&Object.keys(value).every(k=>keys.includes(k));
function validate(kind,body){
 if(kind==='student-profile'){
  if(!exact(body,['fullName'])||typeof body.fullName!=='string')deny(400,'INVALID_STUDENT_PROFILE');
  const fullName=body.fullName.trim();
  if(fullName.length<2||fullName.length>160||/[\x00-\x1f\x7f]/.test(fullName))deny(400,'INVALID_STUDENT_PROFILE');
  return {fullName};
 }
 if(!exact(body,['studentId','batchId'])||!isUUID(body.studentId)||!isUUID(body.batchId))deny(400,'INVALID_ENROLLMENT_REQUEST');
 return {studentId:body.studentId,batchId:body.batchId};
}
function validateResult(kind,result,target,data){
 if(kind==='student-profile'){
  if(!exact(result,['id','fullName'])||result.id!==target||result.fullName!==data.fullName)deny(502,'UPSTREAM_DATA_INVALID');
 }else if(!exact(result,['id','studentId','batchId','status'])||!isUUID(result.id)||result.studentId!==data.studentId||result.batchId!==data.batchId||result.status!=='pending')deny(502,'UPSTREAM_DATA_INVALID');
 return result;
}
export function createTeacherAdminCommandEndpoint(kind,{verify,execute}={}){
 if(!['student-profile','enrollment-request'].includes(kind)||typeof verify!=='function'||typeof execute!=='function')throw Error('INVALID_COMMAND_PORT');
 return async function COMMAND(req,ctx={}){
  try{
   if(!(req instanceof Request)||req.method!==(kind==='student-profile'?'PATCH':'POST'))deny(405,'METHOD_NOT_ALLOWED');
   if(new URL(req.url).search)deny(400,'INVALID_QUERY');
   const token=tokenFrom(req),operationId=operationFrom(req);
   const data=validate(kind,await bodyFrom(req));
   const target=kind==='student-profile'?(await ctx.params)?.studentId:null;
   if(kind==='student-profile'&&!isUUID(target))deny(400,'INVALID_RESOURCE_ID');
   const actor=await verify(token);
   if(!actor||actor.verified!==true||!isUUID(actor.userId)||actor.role!=='teacher'||actor.accountStatus!=='active'||actor.accessToken!==token)deny(403,'FORBIDDEN');
   const result=await execute(kind,{token,operationId,target,data:Object.freeze(data),actorId:actor.userId});
   return respond(kind==='enrollment-request'?201:200,{success:true,data:validateResult(kind,result,target,data)});
  }catch(error){
   if(error?.code&&[400,401,403,405,413,415,502].includes(error.status))return respond(error.status,{success:false,error:{code:error.code}});
   return respond(503,{success:false,error:{code:'SERVICE_UNAVAILABLE'}});
  }
 };
}
