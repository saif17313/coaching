import {domainRpcError,RpcError} from './rpc-errors.mjs';
import 'server-only';
import {createStudentCompletionRoute,type StudentCompletionKind} from './student-completion.mjs';
import {verifyActiveActor} from './production-read-adapter';
const allow=new Set(['coaching_student_dashboard','coaching_student_profile','coaching_student_update_own_profile','coaching_student_billing_statement','coaching_student_calendar','coaching_student_progress']);
async function call(name:string,token:string,args:Record<string,unknown>):Promise<unknown>{
 if(!allow.has(name))throw Error('RPC_NOT_ALLOWED');
 if(name==='coaching_student_update_own_profile'&&process.env.COACHING_ENABLE_MUTATION_APIS!=='enabled-after-db-verification')throw new RpcError('MUTATIONS_DISABLED',503);
 const raw=process.env.SUPABASE_URL,key=process.env.SUPABASE_ANON_KEY;
 if(!raw||!key||/[^\x21-\x7e]/.test(key)||key.length>4096)throw Error('DB_NOT_CONFIGURED');
 let root:URL;try{root=new URL(raw);}catch{throw Error('DB_NOT_CONFIGURED');}
 const hosted=root.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(root.hostname)&&!root.port;
 const local=process.env.NODE_ENV==='development'&&process.env.COACHING_LOCAL_SUPABASE_TESTING==='allow-loopback-54321'&&root.protocol==='http:'&&root.hostname==='127.0.0.1'&&root.port==='54321';
 if(!(hosted||local)||root.username||root.password||root.pathname!=='/'||root.search||root.hash)throw Error('INVALID_DB_ORIGIN');
 const response=await fetch(new URL(`/rest/v1/rpc/${name}`,root),{method:'POST',headers:{apikey:key,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(args),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)await domainRpcError(response);return response.json();
}
export const studentCompletionRoute=(kind:StudentCompletionKind)=>createStudentCompletionRoute(kind,{verify:verifyActiveActor,call});
