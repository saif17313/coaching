import 'server-only';
import {createHash} from 'node:crypto';
import {createCmsMediaRoute} from './cms-media.mjs';
import {verifyActiveActor} from './production-read-adapter';
import {cmsRpcError,cmsError} from './cms-errors.mjs';
type MediaKind='upload'|'list'|'attach'|'archive'|'publicMedia';
function config(){
 const key=process.env.SUPABASE_ANON_KEY,raw=process.env.SUPABASE_URL;
 if(!raw||!key||/[\x00-\x20\x7f]/.test(key)||key.length>4096)throw Error('DB_NOT_CONFIGURED');
 let root:URL;try{root=new URL(raw);}catch{throw Error('DB_NOT_CONFIGURED');}
 const hosted=root.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(root.hostname)&&!root.port;
 const local=process.env.NODE_ENV==='development'&&process.env.COACHING_LOCAL_SUPABASE_TESTING==='allow-loopback-54321'&&root.protocol==='http:'&&root.hostname==='127.0.0.1'&&root.port==='54321';
 if(!(hosted||local)||root.username||root.password||root.pathname!=='/'||root.search||root.hash)throw Error('INVALID_DB_ORIGIN');
 return {root,key};
}
function mutationGate(){if(process.env.COACHING_ENABLE_MUTATION_APIS!=='enabled-after-db-verification')throw Error('MUTATIONS_DISABLED');}
async function call(name:string,token:string|null,args:Record<string,unknown>):Promise<unknown>{
 if(!['coaching_media_register','coaching_media_list','coaching_media_resolve','coaching_cms_media_mutation'].includes(name))throw Error('UNKNOWN_RPC');
 if(['coaching_media_register','coaching_cms_media_mutation'].includes(name))mutationGate();
 const {root,key}=config();
 const res=await fetch(new URL(`/rest/v1/rpc/${name}`,root),{method:'POST',headers:{apikey:key,Authorization:`Bearer ${token??key}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(args),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!res.ok)await cmsRpcError(res);
 return res.json();
}
const encodedPath=(x:string)=>x.split('/').map(encodeURIComponent).join('/');
async function upload({token,key,bytes,contentType}:{token:string,key:string,bytes:Uint8Array,contentType:string}){
 mutationGate();const {root,key:anon}=config();
 if(!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|avif)$/.test(key))throw Error('INVALID_STORAGE_KEY');
 const data=new Uint8Array(bytes.length);data.set(bytes);
 const res=await fetch(new URL(`/storage/v1/object/musa-site-media/${encodedPath(key)}`,root),{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${token}`,'Content-Type':contentType,'x-upsert':'false','Cache-Control':'no-store'},body:data,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(25000)});
 if(!res.ok){
  const failure=await res.json().catch(()=>null);
  if(res.status!==409&&failure?.statusCode!=='409'&&failure?.error!=='Duplicate')throw cmsError('MEDIA_STORAGE_UNAVAILABLE',503);
  // Retrying a completed upload must never overwrite an object. Read it under
  // this Teacher's JWT and confirm the bytes before replaying the metadata RPC.
  const previous=await readObject({key,token});
  const digest=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');
  if(previous.length!==bytes.length||digest(previous)!==digest(bytes))throw cmsError('IDEMPOTENCY_CONFLICT',409);
 }
}
async function readObject({key,token}:{key:string;token?:string}):Promise<Uint8Array>{
 const {root,key:anon}=config();
 if(!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|avif)$/.test(key))throw Error('INVALID_STORAGE_KEY');
 const res=await fetch(new URL(`/storage/v1/object/authenticated/musa-site-media/${encodedPath(key)}`,root),{headers:{apikey:anon,Authorization:`Bearer ${token??anon}`},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error('STORAGE_READ_DENIED');
 const len=Number(res.headers.get('content-length'));if(Number.isFinite(len)&&len>5242880)throw Error('MEDIA_TOO_LARGE');
 const reader=res.body?.getReader();if(!reader)throw Error('MEDIA_MISSING');let size=0;const parts:Uint8Array[]=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>5242880)throw Error('MEDIA_TOO_LARGE');parts.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}
 const bytes=new Uint8Array(size);let i=0;for(const part of parts){bytes.set(part,i);i+=part.length;}return bytes;
}
export const cmsMediaRoute=(kind:MediaKind)=>createCmsMediaRoute(kind,{verify:verifyActiveActor,call,upload,readObject});
