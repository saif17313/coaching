import {validOrganization} from '../../client/cms-order.mjs';
import {cmsError,cmsFailure} from './cms-errors.mjs';
const uid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
export function createCmsOrganizeRoute({verify,call}){
 return async(req,ctx={})=>{
  const send=(status,value)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  try{
   if(req.method!=='POST')throw cmsError('METHOD_NOT_ALLOWED',405);
   if(new URL(req.url).search)throw cmsError('INVALID_QUERY',400);
   const {pageId}=await ctx.params??{};if(!uid(pageId))throw cmsError('INVALID_RESOURCE_ID',400);
   const token=/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(req.headers.get('authorization')??'')?.[1];
   if(!token||token.length>8192)throw cmsError('UNAUTHORIZED',401);
   const actor=await verify(token);if(actor?.verified!==true||actor.role!=='teacher'||actor.accountStatus!=='active')throw cmsError('FORBIDDEN',403);
   if(!uid(req.headers.get('idempotency-key')))throw cmsError('INVALID_OPERATION_ID',400);
   if(req.headers.get('content-type')!=='application/json')throw cmsError('INVALID_CONTENT_TYPE',415);
   const text=await req.text();if(text.length>5000)throw cmsError('BODY_TOO_LARGE',413);
   let data;try{data=JSON.parse(text);}catch{throw cmsError('INVALID_BODY',400);}
   if(!validOrganization(data))throw cmsError('INVALID_CONTENT_ORDER',400);
   const result=await call('coaching_cms_organize',token,{p_action:data.action,p_page_id:pageId,p_section_id:data.sectionId,p_item_id:data.itemId,p_order_ids:data.orderIds,p_expected_revision:data.expectedRevision,p_operation_id:req.headers.get('idempotency-key')});
   if(!result||Object.keys(result).sort().join(',')!=='id,revision,status'||result.id!==(data.action==='media.detach'?data.itemId:pageId)||result.revision!==data.expectedRevision+1||!['draft','published'].includes(result.status))throw cmsError('UPSTREAM_DATA_INVALID',502);
   return send(200,{success:true,data:result});
  }catch(e){const {status,code}=cmsFailure(e);return send(status,{success:false,error:{code}});}
 };
}
