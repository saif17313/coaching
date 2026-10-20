import {admissionId,validateAdmissionChanges,validateAdmissionProfile} from '../../client/student-admission.mjs';
import {RpcError} from './rpc-errors.mjs';
const fail=(code,status)=>{throw new RpcError(code,status);};
async function bodyOf(req){
 if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers.get('content-type')??''))fail('UNSUPPORTED_MEDIA_TYPE',415);
 const reader=req.body?.getReader();if(!reader)fail('INVALID_ADMISSION',400);let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();fail('BODY_TOO_LARGE',413);}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('INVALID_ADMISSION',400);}
}
export function createStudentAdmissionRoute(role,{verify,call}={}){
 if(!['teacher','student'].includes(role)||typeof verify!=='function'||typeof call!=='function')throw Error('INVALID_ADMISSION_PORT');
 return async req=>{
  try{
   const url=new URL(req.url),match=role==='teacher'?/^\/api\/v1\/teacher\/students\/([0-9a-f-]{36})\/admission$/.exec(url.pathname):/^\/api\/v1\/student\/admission-profile$/.exec(url.pathname);
   if(!match||url.search)fail('INVALID_REQUEST',400);
   if(!['GET','PATCH'].includes(req.method))fail('METHOD_NOT_ALLOWED',405);
   const token=/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(req.headers.get('authorization')??'')?.[1];if(!token||token.length>8192)fail('UNAUTHORIZED',401);
   const actor=await verify(token);if(!actor?.verified||actor.role!==role||!admissionId(actor.userId))fail('FORBIDDEN',403);
   const id=role==='teacher'?match[1]:actor.userId;if(!admissionId(id))fail('INVALID_REQUEST',400);
   let name='coaching_student_admission_read',args={p_student_id:id};
   if(req.method==='PATCH'){
    const operation=req.headers.get('idempotency-key');if(!admissionId(operation))fail('INVALID_OPERATION_ID',400);
    const body=await bodyOf(req);
    if(!body||Object.keys(body).sort().join(',')!=='data,expectedRevision'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)fail('INVALID_ADMISSION',400);
    let data;try{data=validateAdmissionChanges(body.data,role);}catch{fail('INVALID_ADMISSION',400);}
    name='coaching_student_admission_write';args={...args,p_data:data,p_expected_revision:body.expectedRevision,p_operation_id:operation};
   }
   const raw=await call(name,token,args);let data;try{data=validateAdmissionProfile(raw,id,role);}catch{fail('UPSTREAM_DATA_INVALID',502);}
   return Response.json({success:true,data},{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }catch(error){const status=error.status??error.httpStatus;return Response.json({success:false,error:{code:[400,401,403,404,405,409,413,415,502,503].includes(status)?error.code??error.publicCode:'ADMISSION_SERVICE_UNAVAILABLE'}},{status:[400,401,403,404,405,409,413,415,502,503].includes(status)?status:503,headers:{'Cache-Control':'no-store'}});}
 };
}
