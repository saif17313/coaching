import {validateCmsFields} from '../../client/cms-fields.mjs';
import {cmsError,cmsFailure} from './cms-errors.mjs';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
export function createCmsFieldsRoute({verify,call}){
 return async(req,ctx={})=>{
  const send=(status,value)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  try{
   if(req.method!=='PUT')throw cmsError('METHOD_NOT_ALLOWED',405);
   if(new URL(req.url).search)throw cmsError('INVALID_QUERY',400);
   const {pageId,sectionId}=await ctx.params??{};
   if(!uuid(pageId)||!uuid(sectionId))throw cmsError('INVALID_RESOURCE_ID',400);
   const token=/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(req.headers.get('authorization')??'')?.[1];
   if(!token||token.length>8192)throw cmsError('UNAUTHORIZED',401);
   const actor=await verify(token);
   if(actor?.verified!==true||actor.role!=='teacher'||actor.accountStatus!=='active')throw cmsError('FORBIDDEN',403);
   if(!uuid(req.headers.get('idempotency-key')))throw cmsError('INVALID_OPERATION_ID',400);
   if(req.headers.get('content-type')!=='application/json')throw cmsError('INVALID_CONTENT_TYPE',415);
   const str=await req.text();if(str.length>64000)throw cmsError('BODY_TOO_LARGE',413);
   let data;try{data=JSON.parse(str);}catch{throw cmsError('INVALID_BODY',400);}
   if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).sort().join(',')!=='content,expectedRevision,itemId,sectionKey'||!Number.isSafeInteger(data.expectedRevision)||data.expectedRevision<1||data.expectedRevision>1e9||data.itemId!==null&&!uuid(data.itemId)||!validateCmsFields(data.sectionKey,data.content,data.itemId!==null))throw cmsError('INVALID_TYPED_CONTENT',400);
   const result=await call('coaching_cms_fields_write',token,{p_page_id:pageId,p_section_id:sectionId,p_item_id:data.itemId,p_section_key:data.sectionKey,p_content:data.content,p_expected_revision:data.expectedRevision,p_operation_id:req.headers.get('idempotency-key')});
   if(!result||Object.keys(result).sort().join(',')!=='id,revision,status'||result.id!==(data.itemId??sectionId)||result.revision!==data.expectedRevision+1||!['draft','published'].includes(result.status))throw cmsError('UPSTREAM_DATA_INVALID',502);
   return send(200,{success:true,data:result});
  }catch(e){const {status,code}=cmsFailure(e);return send(status,{success:false,error:{code}});}
 };
}
