/** Teacher site settings, page archive and safe anonymous navigation (Part J). */
import {cmsFailure} from './cms-errors.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const jwt=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const isUUID=x=>typeof x==='string'&&uuid.test(x);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const exact=(x,keys)=>object(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const bounded=(x,min,max)=>typeof x==='string'&&x.trim().length>=min&&x.length<=max&&!/[\x00-\x1f\x7f]/.test(x);
const revision=x=>Number.isSafeInteger(x)&&x>=0&&x<=1000000000;
const fail=(code,status)=>{const e=new Error(code);e.code=code;e.status=status;throw e;};
const result=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function token(req){const raw=req.headers.get('authorization')??'',m=/^Bearer ([^\s,]+)$/.exec(raw);if(!m||m[1].length>8192||!jwt.test(m[1]))fail('UNAUTHORIZED',401);return m[1];}
function opId(req){const id=req.headers.get('idempotency-key');if(!isUUID(id))fail('INVALID_OPERATION_ID',400);return id;}
async function json(req){const type=req.headers.get('content-type')??'';if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(type))fail('INVALID_CONTENT_TYPE',415);
 const size=req.headers.get('content-length');if(size!==null&&(!/^\d+$/.test(size)||Number(size)>4096))fail('BODY_TOO_LARGE',413);
 const body=await req.text();if(body.length>4096)fail('BODY_TOO_LARGE',413);let parsed;try{parsed=JSON.parse(body);}catch{fail('INVALID_BODY',400);}if(!object(parsed))fail('INVALID_BODY',400);return parsed;}
function settings(x,allowLogo=false){
 const k=['siteTitle','tagline','contactEmail','contactPhone','footerText','logoMediaId'];
 if(!exact(x,k)||!bounded(x.siteTitle,2,160)||!bounded(x.tagline,0,160)||!bounded(x.footerText,0,1000)||/[<>]/.test(x.siteTitle+x.tagline+x.footerText)
  ||!bounded(x.contactEmail,3,254)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.contactEmail)
  ||!(x.contactPhone===null||bounded(x.contactPhone,7,20))
  ||!(x.logoMediaId===null||(allowLogo&&isUUID(x.logoMediaId))))fail('INVALID_SETTINGS',400);
 return x;
}
function responseSettings(x){if(!exact(x,['revision','publishedRevision','settings'])||!revision(x.revision)||!(x.publishedRevision===null||revision(x.publishedRevision)&&x.publishedRevision<=x.revision))fail('UPSTREAM_DATA_INVALID',502);
 try{settings(x.settings);}catch{fail('UPSTREAM_DATA_INVALID',502);}return x;}
function responseMutation(x,action,target){
 if(action==='archive'){
  if(!exact(x,['id','revision','status'])||x.id!==target||!revision(x.revision)||x.revision===0||x.status!=='archived')fail('UPSTREAM_DATA_INVALID',502);
 }else if(!exact(x,['revision','publishedRevision'])||!revision(x.revision)||x.revision===0||!(x.publishedRevision===null||revision(x.publishedRevision)&&x.publishedRevision<=x.revision)
  ||action==='settingsPublish'&&x.publishedRevision!==x.revision)fail('UPSTREAM_DATA_INVALID',502);
 return x;
}
function responseNav(x){if(!exact(x,['items'])||!Array.isArray(x.items)||x.items.length>50)fail('UPSTREAM_DATA_INVALID',502);const slugs=new Set();for(const item of x.items){if(!exact(item,['slug','title'])||typeof item.slug!=='string'||!/^[a-z][a-z0-9-]{1,62}$/.test(item.slug)||item.slug.endsWith('-')||item.slug.includes('--')||slugs.has(item.slug)||!bounded(item.title,2,160))fail('UPSTREAM_DATA_INVALID',502);slugs.add(item.slug);}return x;}
export function createCmsSettingsRoute(kind,{verify,call}={}){
 if(!['settingsRead','settingsUpdate','settingsPublish','archive','navigation'].includes(kind)||typeof call!=='function'||kind!=='navigation'&&typeof verify!=='function')throw Error('INVALID_CMS_SETTINGS_PORT');
 return async(req,context={})=>{
  try{
   if(!(req instanceof Request)||req.method!==(kind==='settingsUpdate'?'PUT':kind==='settingsRead'||kind==='navigation'?'GET':'POST'))fail('METHOD_NOT_ALLOWED',405);
   if(new URL(req.url).search)fail('INVALID_QUERY',400);
   const params=await context.params??{};if(kind==='archive'&&!isUUID(params.pageId))fail('INVALID_RESOURCE_ID',400);
   const bearer=kind==='navigation'?null:token(req);
   if(bearer){const who=await verify(bearer);if(!who||who.verified!==true||who.role!=='teacher'||who.accountStatus!=='active'||!isUUID(who.userId))fail('FORBIDDEN',403);}
   let name,paramsDb={};let expected=null;
   if(kind==='settingsUpdate'){
    const key=opId(req),input=await json(req);
    if(!exact(input,['expectedRevision','settings'])||!revision(input.expectedRevision))fail('INVALID_SETTINGS',400);
    const safe=settings(input.settings);name='coaching_cms_settings_write';paramsDb={p_action:'draft.update',p_expected_revision:input.expectedRevision,p_settings:safe,p_operation_id:key};
   }else if(kind==='settingsPublish'){
    const key=opId(req),input=await json(req);
    if(!exact(input,['expectedRevision'])||!revision(input.expectedRevision)||input.expectedRevision===0)fail('INVALID_REVISION',400);
    name='coaching_cms_settings_write';paramsDb={p_action:'publish',p_expected_revision:input.expectedRevision,p_settings:null,p_operation_id:key};
   }else if(kind==='archive'){
    const key=opId(req),input=await json(req);
    if(!exact(input,['expectedRevision'])||!revision(input.expectedRevision)||input.expectedRevision===0)fail('INVALID_REVISION',400);
    name='coaching_cms_archive_page';paramsDb={p_page_id:params.pageId,p_expected_revision:input.expectedRevision,p_operation_id:key};expected=params.pageId;
   }else if(kind==='settingsRead'){name='coaching_cms_get_settings_draft';}
   else{name='coaching_cms_public_navigation';}
   const raw=await call(name,bearer,paramsDb);
   const data=kind==='settingsRead'?responseSettings(raw):kind==='navigation'?responseNav(raw):responseMutation(raw,kind,expected);
   return result(200,{success:true,data});
  }catch(e){const {status,code}=cmsFailure(e);return result(status,{success:false,error:{code}});}
 };
}
