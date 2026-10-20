import 'server-only';
import {createHash} from 'node:crypto';
import {verifyActiveActor} from './production-read-adapter';
import {safeSupabaseAuthConfig} from '../browser-session.mjs';
import {createLearningMaterialRoute,materialBytes,type LearningMaterialKind} from './learning-materials.mjs';
import {domainRpcError,RpcError} from './rpc-errors.mjs';
const bucket='educentre-learning-materials',path=(key:string)=>{if(!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.pdf$/.test(key))throw new RpcError('INVALID_MATERIAL',400);return key.split('/').map(encodeURIComponent).join('/');};
const gate=()=>{if(process.env.COACHING_ENABLE_MUTATION_APIS!=='enabled-after-db-verification')throw new RpcError('MUTATIONS_DISABLED',503);};
async function call(name:string,token:string,args:Record<string,unknown>):Promise<unknown>{
 if(!['coaching_learning_upload_register','coaching_learning_material_write','coaching_learning_material_download'].includes(name))throw Error('UNKNOWN_RPC');if(name!=='coaching_learning_material_download')gate();
 const {root,key}=safeSupabaseAuthConfig(process.env);const r=await fetch(new URL('/rest/v1/rpc/'+name,root),{method:'POST',headers:{apikey:key,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(args),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)await domainRpcError(r);return r.json();
}
async function readObject({token,key}:{token:string;key:string}):Promise<Uint8Array>{
 const {root,key:anon}=safeSupabaseAuthConfig(process.env);const r=await fetch(new URL(`/storage/v1/object/authenticated/${bucket}/${path(key)}`,root),{headers:{apikey:anon,Authorization:`Bearer ${token}`},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw new RpcError(r.status===404?'MATERIAL_NOT_FOUND':r.status===401?'UNAUTHORIZED':r.status===403?'FORBIDDEN':'MATERIAL_STORAGE_UNAVAILABLE',r.status===404?404:r.status===401?401:r.status===403?403:503);return materialBytes(r);
}
async function upload({token,key,bytes}:{token:string;key:string;bytes:Uint8Array}):Promise<void>{
 gate();const {root,key:anon}=safeSupabaseAuthConfig(process.env);const r=await fetch(new URL(`/storage/v1/object/${bucket}/${path(key)}`,root),{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${token}`,'Content-Type':'application/pdf','x-upsert':'false'},body:new Uint8Array(bytes),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(25000)});
 if(!r.ok){const error=await r.json().catch(()=>null);if(r.status!==409&&error?.statusCode!=='409'&&error?.error!=='Duplicate')throw new RpcError('MATERIAL_STORAGE_UNAVAILABLE',503);const previous=await readObject({token,key});const sha=(x:Uint8Array)=>createHash('sha256').update(x).digest('hex');if(previous.length!==bytes.length||sha(previous)!==sha(bytes))throw new RpcError('IDEMPOTENCY_CONFLICT',409);}
}
export const learningMaterialRoute=(kind:LearningMaterialKind)=>createLearningMaterialRoute(kind,{verify:verifyActiveActor,call,upload,readObject});
