import {validateStudentWorkflow,workflowInput} from '../../client/student-workflow.mjs';
import {admissionId} from '../../client/student-admission.mjs';
import {readSmallJsonBody} from './student-admission.mjs';
import {RpcError} from './rpc-errors.mjs';
export function createStudentWorkflowRoute(role,{verify,call}){return async request=>{try{
 const fail=(code,status)=>{throw new RpcError(code,status);};const url=new URL(request.url);if(url.search||!['GET','POST'].includes(request.method))fail('INVALID_REQUEST',400);
 const token=/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(request.headers.get('authorization')??'')?.[1];if(!token||token.length>8192)fail('UNAUTHORIZED',401);
 const actor=await verify(token);if(!actor?.verified||actor.accessToken!==token||actor.role!==role||actor.accountStatus!=='active'||!admissionId(actor.userId))fail('FORBIDDEN',403);
 const match=/^\/api\/v1\/teacher\/students\/([0-9a-f-]{36})\/workflow$/.exec(url.pathname);const id=role==='teacher'?match?.[1]:url.pathname==='/api/v1/student/admission-workflow'?actor.userId:null;if(!admissionId(id))fail('INVALID_REQUEST',400);
 let args={p_student_id:id},name='coaching_student_workflow_read';if(request.method==='POST'){
  const operation=request.headers.get('idempotency-key');if(!admissionId(operation))fail('INVALID_OPERATION_ID',400);const body=await readSmallJsonBody(request);if(!body||Object.keys(body).sort().join(',')!=='action,data'||typeof body.action!=='string')fail('INVALID_INPUT',400);
  let data;try{data=workflowInput(body.action,body.data,role);}catch{fail('INVALID_INPUT',400);}name='coaching_student_workflow_command';args={...args,p_action:body.action,p_data:data,p_operation_id:operation};
 }
 const raw=await call(name,token,args);let data;try{data=validateStudentWorkflow(raw,id,role);}catch{fail('UPSTREAM_DATA_INVALID',502);}
 return Response.json({success:true,data},{headers:{'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
}catch(error){const status=error.status??error.httpStatus;return Response.json({success:false,error:{code:[400,401,403,404,409,413,415,502,503].includes(status)?error.code??error.publicCode:'WORKFLOW_UNAVAILABLE'}},{status:[400,401,403,404,409,413,415,502,503].includes(status)?status:503,headers:{'Cache-Control':'no-store'}});}};}
