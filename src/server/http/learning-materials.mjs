import {createHash} from 'node:crypto';
import {cmsFailure,cmsError} from './cms-errors.mjs';
const uid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>object(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const stamp=x=>typeof x==='string'&&x.length<=40&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(x)&&Number.isFinite(Date.parse(x));
const max=5242880,sha=x=>createHash('sha256').update(x).digest('hex');
const fail=(code,status=400)=>{throw cmsError(code,status);};
export const validPdfFilename=x=>typeof x==='string'&&x.length>=5&&x.length<=160&&/\.pdf$/i.test(x)&&!/[\x00-\x1f\x7f/\\]/.test(x);
export const validPdfBytes=bytes=>bytes instanceof Uint8Array&&bytes.length>=12&&new TextDecoder().decode(bytes.slice(0,5))==='%PDF-'&&new TextDecoder().decode(bytes.slice(-1024)).includes('%%EOF');
export async function materialBytes(request){
 const declared=request.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)<1||Number(declared)>max))fail('INVALID_MATERIAL_SIZE',413);
 const reader=request.body?.getReader();if(!reader)fail('INVALID_MATERIAL');const parts=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)fail('INVALID_MATERIAL_SIZE',413);parts.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}
 if(!size)fail('INVALID_MATERIAL');const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}return bytes;
}
export function validMaterialCommand(data){
 if(!exact(data,['action','materialId','uploadId','title','description','releaseAt','expectedUpdatedAt'])||!uid(data.materialId)||!['draft.create','draft.update','publish','archive'].includes(data.action))return false;
 if(data.action==='draft.create'?data.expectedUpdatedAt!==null:!stamp(data.expectedUpdatedAt))return false;
 if(['publish','archive'].includes(data.action))return [data.uploadId,data.title,data.description,data.releaseAt].every(x=>x===null);
 return uid(data.uploadId)&&typeof data.title==='string'&&data.title.trim().length>=2&&data.title.length<=160&&!/[\x00-\x1f\x7f]/.test(data.title)&&typeof data.description==='string'&&data.description.length<=2000&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(data.description)&&(data.releaseAt===null||stamp(data.releaseAt));
}
const headers={'Cache-Control':'private, no-store','Vary':'Cookie, Authorization','X-Content-Type-Options':'nosniff'};
export function createLearningMaterialRoute(kind,{verify,call,upload,readObject}){
 if(!['upload','write','teacherFile','studentFile'].includes(kind))throw Error('INVALID_MATERIAL_PORT');
 return async(request,context={})=>{try{
  const download=kind.endsWith('File');if(request.method!==(download?'GET':'POST'))fail('METHOD_NOT_ALLOWED',405);
  if(new URL(request.url).search)fail('INVALID_QUERY');
  const params=await context.params??{};if(!uid(download?params.materialId:params.batchId))fail('INVALID_RESOURCE_ID');
  const token=/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(request.headers.get('authorization')??'')?.[1];if(!token||token.length>8192)fail('UNAUTHORIZED',401);
  const actor=await verify(token);if(actor?.verified!==true||actor.accountStatus!=='active'||actor.role!==(kind==='studentFile'?'student':'teacher')||!uid(actor.userId))fail('FORBIDDEN',403);
  if(download){
   const file=await call('coaching_learning_material_download',token,{p_id:params.materialId});if(file===null)fail('MATERIAL_NOT_FOUND',404);
   if(!exact(file,['id','uploadId','key','filename','contentType','sizeBytes','sha256'])||file.id!==params.materialId||!uid(file.uploadId)||!validPdfFilename(file.filename)||file.contentType!=='application/pdf'||!Number.isSafeInteger(file.sizeBytes)||file.sizeBytes<1||file.sizeBytes>max||typeof file.sha256!=='string'||!/^[a-f0-9]{64}$/.test(file.sha256)||!new RegExp('^[a-f0-9-]{36}/[a-f0-9-]{36}/'+file.uploadId+'\\.pdf$').test(file.key))fail('UPSTREAM_DATA_INVALID',502);
   const bytes=await readObject({token,key:file.key});if(bytes.length!==file.sizeBytes||sha(bytes)!==file.sha256||!validPdfBytes(bytes))fail('MATERIAL_STORAGE_NOT_VERIFIED',502);
   const name=encodeURIComponent(file.filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
   return new Response(bytes,{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="learning-material.pdf"; filename*=UTF-8''${name}`,'Content-Security-Policy':"sandbox; default-src 'none'",'Referrer-Policy':'no-referrer'}});
  }
  const operation=request.headers.get('idempotency-key');if(!uid(operation))fail('INVALID_OPERATION_ID');
  if(kind==='upload'){
   let filename;try{filename=decodeURIComponent(request.headers.get('x-filename')??'');}catch{fail('INVALID_MATERIAL');}
   const id=request.headers.get('x-upload-id');if(!uid(id)||!validPdfFilename(filename))fail('INVALID_MATERIAL');if(request.headers.get('content-type')!=='application/pdf')fail('PDF_REQUIRED',415);
   const bytes=await materialBytes(request);if(!validPdfBytes(bytes))fail('INVALID_PDF');
   const key=`${actor.userId}/${params.batchId}/${id}.pdf`;
   await upload({token,key,bytes});
   const result=await call('coaching_learning_upload_register',token,{p_id:id,p_batch_id:params.batchId,p_filename:filename,p_size_bytes:bytes.length,p_sha256:sha(bytes),p_operation_id:operation});
   if(!exact(result,['id','filename','contentType','sizeBytes'])||result.id!==id||result.filename!==filename||result.contentType!=='application/pdf'||result.sizeBytes!==bytes.length)fail('UPSTREAM_DATA_INVALID',502);
   return Response.json({success:true,data:result},{status:201,headers});
  }
  if(request.headers.get('content-type')!=='application/json')fail('INVALID_CONTENT_TYPE',415);
  const raw=await request.text();if(raw.length>10000)fail('BODY_TOO_LARGE',413);let data;try{data=JSON.parse(raw);}catch{fail('INVALID_BODY');}
  if(!validMaterialCommand(data))fail('INVALID_MATERIAL');
  const result=await call('coaching_learning_material_write',token,{p_action:data.action,p_id:data.materialId,p_batch_id:params.batchId,p_upload_id:data.uploadId,p_title:data.title,p_description:data.description,p_release_at:data.releaseAt,p_expected_updated_at:data.expectedUpdatedAt,p_operation_id:operation});
  const expected=data.action==='publish'?'published':data.action==='archive'?'archived':'draft';
  if(!exact(result,['id','batchId','status','updatedAt'])||result.id!==data.materialId||result.batchId!==params.batchId||result.status!==expected||!stamp(result.updatedAt))fail('UPSTREAM_DATA_INVALID',502);
  return Response.json({success:true,data:result},{status:201,headers});
 }catch(e){const {code,status}=cmsFailure(e);return Response.json({success:false,error:{code}},{status,headers});}};
}
