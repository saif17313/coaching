import {admissionId} from '../../client/student-admission.mjs';
import {validateDemoWorkspace} from '../../client/demo-workspace.mjs';
import {readSmallJsonBody} from './student-admission.mjs';
import {RpcError} from './rpc-errors.mjs';
export function createDemoWorkspaceRoute(role,{verify,call,render}){return async request=>{try{
 const fail=(code,status)=>{throw new RpcError(code,status);};const url=new URL(request.url),root='/api/v1/'+role+'/demo-workspace',receipt=new RegExp('^'+root+'/receipts/([0-9a-f-]{36})$').exec(url.pathname);
 if(url.search||url.pathname!==root&&!receipt||!['GET','POST'].includes(request.method)||receipt&&request.method!=='GET')fail('INVALID_REQUEST',400);
 const token=/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(request.headers.get('authorization')??'')?.[1];if(!token||token.length>8192)fail('UNAUTHORIZED',401);
 const actor=await verify(token);if(!actor?.verified||actor.accessToken!==token||actor.role!==role||actor.accountStatus!=='active'||!admissionId(actor.userId))fail('FORBIDDEN',403);
 let raw;if(request.method==='POST'){
  const op=request.headers.get('idempotency-key');if(!admissionId(op))fail('INVALID_OPERATION_ID',400);const body=await readSmallJsonBody(request);
  if(!body||Object.keys(body).sort().join(',')!=='action,data,revision'||!Number.isSafeInteger(body.revision)||body.revision<0||!['seed','archive','student.create','profile.edit','admission.decide','batch.create','enrollment.create','enrollment.decide','payment.report','payment.review','payment.post','charge.waive','payment.refund'].includes(body.action)||!body.data||typeof body.data!=='object'||Array.isArray(body.data))fail('INVALID_INPUT',400);
  if(role==='student'&&!['profile.edit','payment.report'].includes(body.action))fail('FORBIDDEN',403);
  raw=await call('coaching_demo_command',token,{p_action:body.action,p_data:body.data,p_revision:body.revision,p_operation_id:op});
 }else raw=await call('coaching_demo_read',token,{});
 let data;try{data=validateDemoWorkspace(raw);}catch{fail('UPSTREAM_DATA_INVALID',502);}
 if(role==='student'&&data){const student=data.state.students[0];if(data.state.students.length!==1||['enrollments','charges','payments','claims'].some(key=>data.state[key].some(row=>row.studentId!==student.id))||data.state.receipts.some(r=>r.snapshot.studentId!==student.id))fail('UPSTREAM_DATA_INVALID',502);}
 const headers={'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'};
 if(receipt){if(!admissionId(receipt[1]))fail('INVALID_REQUEST',400);const r=data?.state.receipts.find(r=>r.snapshot.paymentId===receipt[1]);if(!r)fail('PAYMENT_NOT_FOUND',404);return new Response(new Uint8Array(await render(r)).buffer,{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="SAMPLE-'+r.snapshot.receiptNumber+'.pdf"'}});}
 return Response.json({success:true,data},{headers});
 }catch(error){const status=error.status??error.httpStatus;return Response.json({success:false,error:{code:[400,401,403,404,409,413,415,502,503].includes(status)?error.code??error.publicCode:'DEMO_UNAVAILABLE'}},{status:[400,401,403,404,409,413,415,502,503].includes(status)?status:503,headers:{'Cache-Control':'no-store'}});}};}
