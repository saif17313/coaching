import {admissionId} from '../../client/student-admission.mjs';
import {readSmallJsonBody} from './student-admission.mjs';
import {validateReceipt} from '../../client/payment-receipt.mjs';
import {RpcError} from './rpc-errors.mjs';
export function createPaymentReceiptRoute(role,{verify,call,render}){return async request=>{try{
 const fail=(code,status)=>{throw new RpcError(code,status);};const url=new URL(request.url),match=new RegExp('^/api/v1/'+role+'/payments/([0-9a-f-]{36})/receipt$').exec(url.pathname);
 if(!match||!admissionId(match[1])||(url.search&&!(request.method==='GET'&&url.search==='?view=1'))||!['GET','POST'].includes(request.method))fail('INVALID_REQUEST',400);
 const token=/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(request.headers.get('authorization')??'')?.[1];if(!token||token.length>8192)fail('UNAUTHORIZED',401);
 const actor=await verify(token);if(!actor?.verified||actor.accessToken!==token||actor.role!==role||actor.accountStatus!=='active'||!admissionId(actor.userId))fail('FORBIDDEN',403);
 if(request.method==='POST'){const body=await readSmallJsonBody(request);if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length)fail('INVALID_INPUT',400);}
 const raw=await call('coaching_payment_receipt',token,{p_payment_id:match[1],p_issue:request.method==='POST'});let data;try{data=validateReceipt(raw);}catch{fail('UPSTREAM_DATA_INVALID',502);}
 if(data.snapshot.paymentId!==match[1]||role==='student'&&data.snapshot.studentId!==actor.userId)fail('UPSTREAM_DATA_INVALID',502);
 const headers={'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'};
 if(request.method==='POST')return Response.json({success:true,data:{receiptNumber:data.snapshot.receiptNumber}},{headers});
 const bytes=await render(data);return new Response(new Uint8Array(bytes).buffer,{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':(url.search==='?view=1'?'inline':'attachment')+'; filename="'+data.snapshot.receiptNumber+'.pdf"'}});
 }catch(error){const status=error.status??error.httpStatus;return Response.json({success:false,error:{code:[400,401,403,404,409,413,415,502,503].includes(status)?error.code??error.publicCode:'RECEIPT_UNAVAILABLE'}},{status:[400,401,403,404,409,413,415,502,503].includes(status)?status:503,headers:{'Cache-Control':'no-store'}});}};}
