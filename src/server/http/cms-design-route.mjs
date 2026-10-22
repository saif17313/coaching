import {validateCmsDesign} from '../../client/cms-design.mjs';
import {readSmallJsonBody} from './student-admission.mjs';
import {admissionId} from '../../client/student-admission.mjs';
import {cmsError,cmsFailure} from './cms-errors.mjs';
export function createCmsDesignRoute({verify,call}){return async(request,context={})=>{const send=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});try{
 if(request.method!=='PUT'||new URL(request.url).search)throw cmsError('INVALID_REQUEST',400);
 const {pageId,sectionId}=await context.params??{};if(!admissionId(pageId)||!admissionId(sectionId)||!admissionId(request.headers.get('idempotency-key')))throw cmsError('INVALID_RESOURCE_ID',400);
 const token=/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(request.headers.get('authorization')??'')?.[1];if(!token||token.length>8192)throw cmsError('UNAUTHORIZED',401);
 const actor=await verify(token);if(actor?.verified!==true||actor.role!=='teacher'||actor.accountStatus!=='active')throw cmsError('FORBIDDEN',403);
 const body=await readSmallJsonBody(request,24576);if(!body||Object.keys(body).sort().join(',')!=='design,expectedRevision,itemId'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1||body.expectedRevision>1e9||body.itemId!==null&&!admissionId(body.itemId)||!validateCmsDesign(body.design))throw cmsError('INVALID_PRESENTATION',400);
 const data=await call('coaching_cms_design_write',token,{p_page_id:pageId,p_section_id:sectionId,p_item_id:body.itemId,p_design:body.design,p_expected_revision:body.expectedRevision,p_operation_id:request.headers.get('idempotency-key')});
 if(!data||Object.keys(data).sort().join(',')!=='id,revision,status'||data.id!==(body.itemId??sectionId)||data.revision!==body.expectedRevision+1||!['draft','published'].includes(data.status))throw cmsError('UPSTREAM_DATA_INVALID',502);
 return send(200,{success:true,data});
 }catch(error){const {status,code}=cmsFailure(error);return send(status,{success:false,error:{code}});}};}
