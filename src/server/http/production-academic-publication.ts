import {domainRpcError,RpcError} from './rpc-errors.mjs';
import 'server-only';
import {teacherPublishEndpoint,type PublishKind,type PublishCommand} from './academic-publication.mjs';
import {verifyActiveActor} from './production-read-adapter';
const names:Record<PublishKind,string>={assignment:'coaching_publish_assignment',exam:'coaching_publish_exam',results:'coaching_publish_exam_results'};
function origin():{root:URL;key:string}{
 const raw=process.env.SUPABASE_URL,key=process.env.SUPABASE_ANON_KEY;
 if(!raw||!key||/[^\x21-\x7e]/.test(key)||key.length>4096)throw Error('INVALID_DATABASE_CONFIG');
 let root:URL;try{root=new URL(raw);}catch{throw Error('INVALID_DATABASE_CONFIG');}
 const hosted=root.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(root.hostname)&&!root.port;
 const local=process.env.NODE_ENV==='development'&&process.env.COACHING_LOCAL_SUPABASE_TESTING==='allow-loopback-54321'&&root.protocol==='http:'&&root.hostname==='127.0.0.1'&&root.port==='54321';
 if(!(hosted||local)||root.username||root.password||root.pathname!=='/'||root.search||root.hash)throw Error('INVALID_DATABASE_ORIGIN');
 return {root,key};
}
async function execute(kind:PublishKind,c:PublishCommand):Promise<unknown>{
 if(process.env.COACHING_ENABLE_MUTATION_APIS!=='enabled-after-db-verification')throw new RpcError('MUTATIONS_DISABLED',503);
 const {root,key}=origin();const arg=kind==='assignment'?'p_assignment_id':'p_exam_id';
 const url=new URL(`/rest/v1/rpc/${names[kind]}`,root);
 const res=await fetch(url,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${c.token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({[arg]:c.target,p_operation_id:c.operationId}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!res.ok)await domainRpcError(res);return res.json();
}
export const teacherAssignmentPublish=teacherPublishEndpoint('assignment',{verify:verifyActiveActor,execute});
export const teacherExamPublish=teacherPublishEndpoint('exam',{verify:verifyActiveActor,execute});
export const teacherExamResultsPublish=teacherPublishEndpoint('results',{verify:verifyActiveActor,execute});
