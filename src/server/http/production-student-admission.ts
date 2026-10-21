import {createTeacherAccountRoute} from './teacher-account.mjs';
import {validateManagementSummary} from '@/client/student-workflow.mjs';
import {readSmallJsonBody} from './student-admission.mjs';
import {createStudentWorkflowRoute} from './student-workflow.mjs';
import {domainRpcError,RpcError} from './rpc-errors.mjs';
import 'server-only';
import {createTeacherStudentDirectory,createTeacherBatchDirectory} from './teacher-student-directory.mjs';
import {createStudentAdmissionRoute} from './student-admission.mjs';
import {verifyActiveActor} from './production-read-adapter';
import {createHash} from 'node:crypto';
import {imageSignature} from './cms-media.mjs';
import {readObject} from './production-cms-media';
import {admissionId} from '@/client/student-admission.mjs';
import {COOKIE_NAME,validAccessToken} from '../browser-session.mjs';
const allow=new Set(['coaching_student_admission_read','coaching_student_admission_write','coaching_student_photo','coaching_teacher_student_directory','coaching_teacher_batch_directory','coaching_teacher_account_profile','coaching_teacher_account_profile_write','coaching_student_workflow_read','coaching_student_workflow_command','coaching_student_document','coaching_management_summary','coaching_teacher_student_identity']);
async function call(name:string,token:string,args:Record<string,unknown>):Promise<unknown>{
 if(!allow.has(name))throw Error('RPC_NOT_ALLOWED');
 if(['coaching_student_admission_write','coaching_teacher_account_profile_write','coaching_student_workflow_command'].includes(name)&&process.env.COACHING_ENABLE_MUTATION_APIS!=='enabled-after-db-verification')throw new RpcError('MUTATIONS_DISABLED',503);
 const raw=process.env.SUPABASE_URL,key=process.env.SUPABASE_ANON_KEY;
 if(!raw||!key||/[^\x21-\x7e]/.test(key)||key.length>4096)throw Error('DB_NOT_CONFIGURED');
 let root:URL;try{root=new URL(raw);}catch{throw Error('DB_NOT_CONFIGURED');}
 const hosted=root.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(root.hostname)&&!root.port;
 const local=process.env.NODE_ENV==='development'&&process.env.COACHING_LOCAL_SUPABASE_TESTING==='allow-loopback-54321'&&root.protocol==='http:'&&root.hostname==='127.0.0.1'&&root.port==='54321';
 if(!(hosted||local)||root.username||root.password||root.pathname!=='/'||root.search||root.hash)throw Error('INVALID_DB_ORIGIN');
 const response=await fetch(new URL(`/rest/v1/rpc/${name}`,root),{method:'POST',headers:{apikey:key,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(args),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)await domainRpcError(response);return response.json();
}
export const studentAdmissionRoute=(role:'teacher'|'student')=>createStudentAdmissionRoute(role,{verify:verifyActiveActor,call});
export const studentPhotoRoute=(role:'teacher'|'student',document=false)=>async(request:Request)=>{
 try{
  const url=new URL(request.url);
  let token=/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(request.headers.get('authorization')??'')?.[1];
  if(!token){
   const cookieHeader=request.headers.get('cookie')??'';
   const match=new RegExp('(?:^|;\\s*)'+COOKIE_NAME+'=([^;]+)').exec(cookieHeader);
   if(match){const rawToken=decodeURIComponent(match[1]);if(validAccessToken(rawToken))token=rawToken;}
  }
  if(!token)throw new RpcError('UNAUTHORIZED',401);
  const actor=await verifyActiveActor(token);if(actor.role!==role)throw new RpcError('FORBIDDEN',403);
  const documents=role==='teacher'?/^\/api\/v1\/teacher\/students\/([^/]+)\/documents\/([^/]+)$/.exec(url.pathname):/^\/api\/v1\/student\/documents\/([^/]+)$/.exec(url.pathname);
  const mediaId=document?documents?.[role==='teacher'?2:1]:null;
  const id=role==='teacher'?(document?documents?.[1]:/^\/api\/v1\/teacher\/students\/([^/]+)\/photo$/.exec(url.pathname)?.[1]):actor.userId;
  if(!admissionId(id)||url.search)throw new RpcError('INVALID_REQUEST',400);
  if(document&&!admissionId(mediaId))throw new RpcError('INVALID_REQUEST',400);
  const raw=await call(document?'coaching_student_document':'coaching_student_photo',token,{p_student_id:id,...(document?{p_media_id:mediaId}:{})});
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new RpcError('UPSTREAM_DATA_INVALID',502);
  const media=raw as {id:string;key:string;contentType:string;sizeBytes:number;sha256:string};
  const extensions:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/avif':'avif'};
  if(Object.keys(media).sort().join(',')!=='contentType,id,key,sha256,sizeBytes'||!admissionId(media.id)||!extensions[media.contentType]||!Number.isSafeInteger(media.sizeBytes)||media.sizeBytes<1||media.sizeBytes>5242880||!/^[0-9a-f]{64}$/.test(media.sha256)||!new RegExp('^[0-9a-f-]{36}/'+media.id+'\\.'+extensions[media.contentType]+'$').test(media.key))throw new RpcError('UPSTREAM_DATA_INVALID',502);
  const bytes=await readObject({key:media.key,token});
  if(bytes.length!==media.sizeBytes||createHash('sha256').update(bytes).digest('hex')!==media.sha256||!imageSignature(bytes,media.contentType))throw new RpcError('MEDIA_INTEGRITY_FAILED',502);
  return new Response(new Uint8Array(bytes).buffer,{headers:{'Content-Type':media.contentType,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie, Authorization'}});
 }catch(error){const e=error as {code?:string;status?:number;httpStatus?:number;publicCode?:string};const status=e.status??e.httpStatus??503;return Response.json({success:false,error:{code:e.code??e.publicCode??'PHOTO_SERVICE_UNAVAILABLE'}},{status,headers:{'Cache-Control':'no-store'}});}
};

export const teacherStudentDirectoryRoute=createTeacherStudentDirectory({verify:verifyActiveActor,call});

export const teacherBatchDirectoryRoute=createTeacherBatchDirectory({verify:verifyActiveActor,call});

export const teacherAccountRoute=createTeacherAccountRoute({verify:verifyActiveActor,call});
export const studentWorkflowRoute=(role:'teacher'|'student')=>createStudentWorkflowRoute(role,{verify:verifyActiveActor,call});

async function verifiedTeacherToken(request:Request){const token=/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(request.headers.get('authorization')??'')?.[1];if(!token)throw new RpcError('UNAUTHORIZED',401);const actor=await verifyActiveActor(token);if(actor.role!=='teacher')throw new RpcError('FORBIDDEN',403);return token;}
function workflowFailure(error:unknown){const e=error as {status?:number;httpStatus?:number;code?:string;publicCode?:string};const status=e.status??e.httpStatus??503;return Response.json({success:false,error:{code:e.code??e.publicCode??'SERVICE_UNAVAILABLE'}},{status,headers:{'Cache-Control':'no-store'}});}
export async function teacherStudentIdentityRoute(request:Request){try{const token=await verifiedTeacherToken(request);const body=await readSmallJsonBody(request) as {email?:unknown};if(!body||Object.keys(body).join(',')!=='email'||typeof body.email!=='string'||body.email.length>254||!/^\S+@\S+\.\S+$/.test(body.email)||new URL(request.url).search)throw new RpcError('INVALID_INPUT',400);const data=await call('coaching_teacher_student_identity',token,{p_email:body.email.trim().toLowerCase()}) as Record<string,unknown>;if(!data||Object.keys(data).sort().join(',')!=='accountStatus,confirmed,state,studentId'||!['available','existing','role_conflict'].includes(String(data.state))||typeof data.confirmed!=='boolean'||!(data.studentId===null||admissionId(data.studentId)))throw new RpcError('UPSTREAM_DATA_INVALID',502);return Response.json({success:true,data},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return workflowFailure(error);}}
export async function teacherManagementSummaryRoute(request:Request){try{const token=await verifiedTeacherToken(request),query=new URL(request.url).searchParams,period=query.get('period');if([...query.keys()].some(key=>key!=='period')||query.getAll('period').length>1||period!==null&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new RpcError('INVALID_PERIOD',400);const data=validateManagementSummary(await call('coaching_management_summary',token,{p_period:period}));return Response.json({success:true,data},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return workflowFailure(error);}}
