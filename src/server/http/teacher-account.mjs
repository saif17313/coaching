import {validateTeacherAccount,validateTeacherAccountChanges,accountStamp} from '../../client/teacher-account.mjs';
import {admissionId} from '../../client/student-admission.mjs';
import {readSmallJsonBody} from './student-admission.mjs';
import {RpcError} from './rpc-errors.mjs';
const fail=(code,status)=>{throw new RpcError(code,status);};
export function createTeacherAccountRoute({verify,call}){return async request=>{try{
 if(!['GET','PATCH'].includes(request.method))fail('METHOD_NOT_ALLOWED',405);
 if(new URL(request.url).search)fail('INVALID_REQUEST',400);
 const token=/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(request.headers.get('authorization')??'')?.[1];if(!token||token.length>8192)fail('UNAUTHORIZED',401);
 const actor=await verify(token);if(!actor?.verified||actor.role!=='teacher'||actor.accountStatus!=='active'||actor.accessToken!==token||!admissionId(actor.userId))fail('FORBIDDEN',403);
 let name='coaching_teacher_account_profile',args={};
 if(request.method==='PATCH'){
  const operation=request.headers.get('idempotency-key');if(!admissionId(operation))fail('INVALID_OPERATION_ID',400);
  const body=await readSmallJsonBody(request);if(!body||Object.keys(body).sort().join(',')!=='data,expectedUpdatedAt'||!accountStamp(body.expectedUpdatedAt))fail('INVALID_PROFILE',400);
  let data;try{data=validateTeacherAccountChanges(body.data);}catch{fail('INVALID_PROFILE',400);}
  name='coaching_teacher_account_profile_write';args={p_data:data,p_expected_updated_at:body.expectedUpdatedAt,p_operation_id:operation};
 }
 const raw=await call(name,token,args);let data;try{data=validateTeacherAccount(raw,actor.userId);}catch{fail('UPSTREAM_DATA_INVALID',502);}
 return Response.json({success:true,data},{headers:{'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
}catch(error){const status=error.status??error.httpStatus;return Response.json({success:false,error:{code:[400,401,403,405,409,413,415,502,503].includes(status)?error.code??error.publicCode:'ACCOUNT_SERVICE_UNAVAILABLE'}},{status:[400,401,403,405,409,413,415,502,503].includes(status)?status:503,headers:{'Cache-Control':'no-store'}});}};}
