import {domainRpcError,RpcError} from './rpc-errors.mjs';
import 'server-only';
import { createProtectedMutationEndpoint, type MutationKind, type MutationCommand } from './protected-mutations.mjs';
import { verifyActiveActor } from './production-read-adapter';

const rpcNames:Record<MutationKind,string>={
  'student-status':'coaching_change_student_status',
  'enrollment-decision':'coaching_decide_enrollment',
  'batch-create':'coaching_create_batch',
  'batch-update':'coaching_update_batch',
};
/** Explicitly disabled by default until migration, RLS and real Auth are verified. */
async function executeRpc(kind:MutationKind,c:MutationCommand):Promise<unknown>{
  if(process.env.COACHING_ENABLE_MUTATION_APIS!=='enabled-after-db-verification')throw new RpcError('MUTATIONS_DISABLED',503);
  const raw=process.env.SUPABASE_URL, key=process.env.SUPABASE_ANON_KEY;
  if(!raw||!key||/[\r\n]/.test(key)||key.length>4096)throw new Error('DB_NOT_CONFIGURED');
  let root:URL;
  try{root=new URL(raw);}catch{throw new Error('DB_NOT_CONFIGURED');}
  const hosted = root.protocol==='https:' && /^[a-z0-9-]+\.supabase\.co$/.test(root.hostname) && !root.port;
  const local = process.env.NODE_ENV==='development' &&
    process.env.COACHING_LOCAL_SUPABASE_TESTING==='allow-loopback-54321' &&
    root.protocol==='http:' && root.hostname==='127.0.0.1' && root.port==='54321';
  if(!(hosted||local)||root.username||root.password||root.pathname!=='/'||root.search||root.hash)throw new Error('INVALID_DB_ORIGIN');
  const payload:Record<string,unknown>={p_operation_id:c.operationId};
  if(kind==='student-status'){payload.p_student_id=c.target;payload.p_next_status=c.input.status;}
  if(kind==='enrollment-decision'){payload.p_enrollment_id=c.target;payload.p_decision=c.input.decision;}
  if(kind==='batch-create'){payload.p_code=c.input.code;payload.p_name=c.input.name;payload.p_capacity=c.input.capacity;}
  if(kind==='batch-update'){payload.p_batch_id=c.target;payload.p_name=c.input.name??null;payload.p_capacity=c.input.capacity??null;payload.p_archived=c.input.isArchived??null;}
  const url=new URL(`/rest/v1/rpc/${rpcNames[kind]}`,root);
  const response=await fetch(url,{
    method:'POST',headers:{'apikey':key,Authorization:`Bearer ${c.token}`,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify(payload),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000),
  });
  if(!response.ok)await domainRpcError(response);
  return response.json();
}
export function protectedMutationRoute(kind:MutationKind){
  return createProtectedMutationEndpoint(kind,{verify:verifyActiveActor,execute:executeRpc});
}
