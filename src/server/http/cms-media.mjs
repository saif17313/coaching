/** Part M: verified private media pipeline. No service-role credentials or public draft previews. */
import {createHash} from 'node:crypto';
import {cmsFailure} from './cms-errors.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const jwt=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const names=Object.freeze({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/avif':'avif'});
const maxBytes=5242880;
const uid=x=>typeof x==='string'&&uuid.test(x);
const fail=(code,status)=>{const e=new Error(code);e.publicCode=code;e.httpStatus=status;throw e;};
const json=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function tokenOf(req){const m=/^Bearer ([^\s,]+)$/.exec(req.headers.get('authorization')??'');if(!m||m[1].length>8192||!jwt.test(m[1]))fail('UNAUTHORIZED',401);return m[1];}
function operation(req){const value=req.headers.get('idempotency-key');if(!uid(value))fail('INVALID_OPERATION_ID',400);return value;}
function safeText(x){return typeof x==='string'&&x.trim().length>=2&&x.length<=200&&!/[\x00-\x1f\x7f]/.test(x);}
const sha=x=>createHash('sha256').update(x).digest('hex');
export function imageSignature(bytes,type){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 if(type==='image/png')return b.length>8&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v);
 if(type==='image/jpeg')return b.length>4&&b[0]===255&&b[1]===216&&b[2]===255&&b[b.length-2]===255&&b[b.length-1]===217;
 if(type==='image/webp')return b.length>16&&String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP';
 if(type==='image/avif')return b.length>16&&String.fromCharCode(...b.slice(4,8))==='ftyp'&&['avif','avis'].includes(String.fromCharCode(...b.slice(8,12)));
 return false;
}
async function limitedBytes(req){
 if(req.headers.has('content-length')){const n=Number(req.headers.get('content-length'));if(!Number.isSafeInteger(n)||n<1||n>maxBytes)fail('INVALID_MEDIA_SIZE',413);}
 const reader=req.body?.getReader();if(!reader)fail('INVALID_MEDIA',400);
 let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes)fail('INVALID_MEDIA_SIZE',413);chunks.push(value);} }catch(e){await reader.cancel().catch(()=>{});throw e;}
 if(!size)fail('INVALID_MEDIA_SIZE',400);
 const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}return bytes;
}
function safeAsset(x){if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).sort().join(',')!=='alt,contentType,id,sizeBytes,status'||!uid(x.id)||!safeText(x.alt)||!Object.hasOwn(names,x.contentType)||!Number.isSafeInteger(x.sizeBytes)||x.sizeBytes<1||x.sizeBytes>maxBytes||!['ready','archived'].includes(x.status))fail('UPSTREAM_DATA_INVALID',502);return x;}
function cleanMediaList(raw){if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).join(',')!=='items'||!Array.isArray(raw.items)||raw.items.length>100)fail('UPSTREAM_DATA_INVALID',502);const seen=new Set();for(const x of raw.items){safeAsset(x);if(seen.has(x.id))fail('UPSTREAM_DATA_INVALID',502);seen.add(x.id);}return raw;}
function safePreview(raw,id){if(raw===null)return null;
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join(',')!=='contentType,id,key,sha256,sizeBytes'||raw.id!==id||!Object.hasOwn(names,raw.contentType)||!Number.isSafeInteger(raw.sizeBytes)||raw.sizeBytes<1||raw.sizeBytes>maxBytes||!RegExp('^[0-9a-f]{64}$').test(raw.sha256)||
 !RegExp('^[0-9a-f-]{36}/'+id+'\\.'+names[raw.contentType]+'$').test(raw.key))fail('UPSTREAM_DATA_INVALID',502);
 return raw;
}
export function createCmsMediaRoute(kind,{verify,call,upload,readObject}={}){
 if(!['upload','list','attach','archive','publicMedia','teacherMedia'].includes(kind)||typeof call!=='function'||(kind!=='publicMedia'&&typeof verify!=='function')||(kind==='upload'&&typeof upload!=='function')||(['publicMedia','teacherMedia'].includes(kind)&&typeof readObject!=='function'))throw Error('INVALID_MEDIA_PORT');
 return async(req,ctx={})=>{
  try{
   if(!(req instanceof Request)||req.method!==(kind==='list'||kind==='publicMedia'||kind==='teacherMedia'?'GET':'POST'))fail('METHOD_NOT_ALLOWED',405);
   if(new URL(req.url).search)fail('INVALID_QUERY',400);
   const p=await ctx.params||{};
   if((kind==='attach'&&(!uid(p.pageId)||!uid(p.itemId)))||(['archive','publicMedia','teacherMedia'].includes(kind)&&!uid(p.mediaId)))fail('INVALID_RESOURCE_ID',400);
   let token=null,actor=null;
   if(kind!=='publicMedia'){
    token=tokenOf(req);actor=await verify(token);
    if(!actor||actor.verified!==true||actor.role!=='teacher'||actor.accountStatus!=='active'||!uid(actor.userId))fail('FORBIDDEN',403);
   }
   if(kind==='list')return json(200,{success:true,data:cleanMediaList(await call('coaching_media_list',token,{}))});
   if(kind==='upload'){
    const op=operation(req),id=req.headers.get('x-media-id'),alt=req.headers.get('x-media-alt'),type=req.headers.get('content-type')?.toLowerCase();
    if(!uid(id)||!safeText(alt)||!Object.hasOwn(names,type))fail('INVALID_MEDIA_METADATA',400);
    const bytes=await limitedBytes(req);
    if(!imageSignature(bytes,type))fail('INVALID_IMAGE_SIGNATURE',415);
    const key=`${actor.userId}/${id}.${names[type]}`;
    await upload({token,key,contentType:type,bytes});
    const raw=await call('coaching_media_register',token,{p_media_id:id,p_storage_key:key,p_content_type:type,p_size_bytes:bytes.length,p_sha256:sha(bytes),p_alt:alt.trim(),p_operation_id:op});
    const a=safeAsset(raw);if(a.id!==id||a.status!=='ready'||a.contentType!==type||a.sizeBytes!==bytes.length||a.alt!==alt.trim())fail('UPSTREAM_DATA_INVALID',502);
    return json(201,{success:true,data:a});
   }
   if(kind==='attach'||kind==='archive'){
    const op=operation(req);if(req.headers.get('content-type')!=='application/json')fail('INVALID_CONTENT_TYPE',415);
    const s=await req.text();if(s.length>512)fail('INVALID_BODY',400);let b;try{b=JSON.parse(s);}catch{fail('INVALID_BODY',400);}
    const keys=Object.keys(b??{});
    if(!b||typeof b!=='object'||Array.isArray(b)||(kind==='attach'?(keys.length!==2||!keys.includes('mediaId')||!keys.includes('expectedRevision')||!uid(b.mediaId)||!Number.isSafeInteger(b.expectedRevision)||b.expectedRevision<1):keys.length!==0))fail('INVALID_BODY',400);
    const id=kind==='attach'?b.mediaId:p.mediaId;
    const raw=await call('coaching_cms_media_mutation',token,{p_action:kind,p_media_id:id,p_page_id:kind==='attach'?p.pageId:null,p_item_id:kind==='attach'?p.itemId:null,p_expected_revision:kind==='attach'?b.expectedRevision:null,p_operation_id:op});
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.id!==id||(kind==='archive'?(Object.keys(raw).sort().join(',')!=='id,status'||raw.status!=='archived'):(Object.keys(raw).sort().join(',')!=='id,revision,status'||raw.status!=='ready'||raw.revision!==b.expectedRevision+1)))fail('UPSTREAM_DATA_INVALID',502);
    return json(200,{success:true,data:raw});
   }
   const data=safePreview(await call(kind==='teacherMedia'?'coaching_media_teacher_preview':'coaching_media_resolve',kind==='teacherMedia'?token:null,{p_media_id:p.mediaId}),p.mediaId);
   if(!data)fail('NOT_FOUND',404);
   const bytes=await readObject({key:data.key,...(kind==='teacherMedia'?{token}:{})});
   if(!(bytes instanceof Uint8Array)||bytes.length!==data.sizeBytes||!imageSignature(bytes,data.contentType)||sha(bytes)!==data.sha256)fail('MEDIA_VERIFICATION_FAILED',503);
   return new Response(bytes,{status:200,headers:{'Content-Type':data.contentType,'Cache-Control':kind==='teacherMedia'?'private, no-store':'no-store','Vary':'Cookie, Authorization','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':'inline'}});
  }catch(e){const {status,code}=cmsFailure(e);return json(status,{success:false,error:{code}});}
 };
}
