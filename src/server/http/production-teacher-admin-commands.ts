import {domainRpcError,RpcError} from './rpc-errors.mjs';
import 'server-only';
import {createTeacherAdminCommandEndpoint} from './teacher-admin-commands.mjs';
import {verifyActiveActor} from './production-read-adapter';
type Kind='student-profile'|'enrollment-request';
type Command={token:string;operationId:string;target:string|null;data:Readonly<Record<string,unknown>>;actorId:string};
async function execute(kind:Kind,c:Command):Promise<unknown>{
  // The existing mutation feature-flag remains mandatory; no automatic production enablement.
  if(process.env.COACHING_ENABLE_MUTATION_APIS!=='enabled-after-db-verification')throw new RpcError('MUTATIONS_DISABLED',503);
  const raw=process.env.SUPABASE_URL,key=process.env.SUPABASE_ANON_KEY;
  if(!raw||!key||/[\r\n]/.test(key)||key.length>4096)throw Error('DB_NOT_CONFIGURED');
  let root:URL;try{root=new URL(raw);}catch{throw Error('DB_NOT_CONFIGURED');}
  const hosted=root.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(root.hostname)&&!root.port;
  const local=process.env.NODE_ENV==='development'&&process.env.COACHING_LOCAL_SUPABASE_TESTING==='allow-loopback-54321'&&root.protocol==='http:'&&root.hostname==='127.0.0.1'&&root.port==='54321';
  if(!(hosted||local)||root.username||root.password||root.pathname!=='/'||root.search||root.hash)throw Error('INVALID_DB_ORIGIN');
  const body=kind==='student-profile'
    ?{p_student_id:c.target,p_full_name:c.data.fullName,p_operation_id:c.operationId}
    :{p_student_id:c.data.studentId,p_batch_id:c.data.batchId,p_operation_id:c.operationId};
  const functionName=kind==='student-profile'?'coaching_update_student_profile':'coaching_request_enrollment';
  const url=new URL(`/rest/v1/rpc/${functionName}`,root);
  const response=await fetch(url,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${c.token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)await domainRpcError(response);
  return response.json();
}
export const teacherStudentProfileRoute=createTeacherAdminCommandEndpoint('student-profile',{verify:verifyActiveActor,execute});
export const teacherEnrollmentRequestRoute=createTeacherAdminCommandEndpoint('enrollment-request',{verify:verifyActiveActor,execute});
