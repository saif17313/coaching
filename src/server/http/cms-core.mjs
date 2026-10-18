/** CMS Core Part I: teacher drafts, atomic publication and public snapshot reads. */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const jwt=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const slug=/^[a-z][a-z0-9-]{1,62}$/;
const kinds=new Set(['hero','rich-text','cards','gallery','results','courses','contact','cta','faq','news','reviews','academic-calendar','routine','materials','footer']);
const own=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const shape=(x,keys,required=keys)=>own(x)&&Object.keys(x).every(k=>keys.includes(k))&&required.every(k=>Object.hasOwn(x,k));
const text=(x,min,max)=>typeof x==='string'&&x.trim().length>=min&&x.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(x);
const uid=x=>typeof x==='string'&&uuid.test(x);
const validSlug=x=>typeof x==='string'&&slug.test(x)&&!x.includes('--')&&!x.endsWith('-');
const int=(x,a,b)=>Number.isSafeInteger(x)&&x>=a&&x<=b;
const deny=(code,status)=>{const e=new Error(code);e.code=code;e.status=status;throw e;};
const send=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const urlValid=x=>{if(x===null)return true;try{const u=new URL(x);return typeof x==='string'&&x.length<=2048&&u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&Boolean(u.hostname);}catch{return false;}};
function bearer(req){const raw=req.headers.get('authorization')??'',m=/^Bearer ([^\s,]+)$/.exec(raw);if(!m||m[1].length>8192||!jwt.test(m[1]))deny('UNAUTHORIZED',401);return m[1];}
function routeKey(req){const x=req.headers.get('idempotency-key');if(!uid(x))deny('INVALID_OPERATION_ID',400);return x;}
async function body(req){if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers.get('content-type')??''))deny('INVALID_CONTENT_TYPE',415);
 const str=await req.text();if(str.length>4096)deny('BODY_TOO_LARGE',413);let value;try{value=JSON.parse(str);}catch{deny('INVALID_BODY',400);}if(!own(value))deny('INVALID_BODY',400);return value;}
function validateWrite(kind,data){
 if(kind==='create'){
  if(!shape(data,['id','slug','title','seoTitle','seoDescription'])||!uid(data.id)||!validSlug(data.slug)||!text(data.title,2,160)||!text(data.seoTitle,2,160)||!text(data.seoDescription,0,300))deny('INVALID_PAGE',400);
  return {id:data.id,data:{slug:data.slug,title:data.title.trim(),seoTitle:data.seoTitle.trim(),seoDescription:data.seoDescription.trim()}};
 }
 if(kind==='update'){
  if(!shape(data,['expectedRevision','title','seoTitle','seoDescription'],['expectedRevision'])||Object.keys(data).length<2||!int(data.expectedRevision,1,1000000000))deny('INVALID_PAGE_PATCH',400);
  const d={};for(const k of ['title','seoTitle','seoDescription'])if(Object.hasOwn(data,k)){if(!text(data[k],k==='seoDescription'?0:2,k==='seoDescription'?300:160))deny('INVALID_PAGE_PATCH',400);d[k]=data[k].trim();}
  return {revision:data.expectedRevision,data:d};
 }
 if(kind==='section'){
  if(!shape(data,['expectedRevision','kind','order','heading','body','visible'])||!int(data.expectedRevision,1,1000000000)||!kinds.has(data.kind)||!int(data.order,0,1000)||!text(data.heading,0,160)||!text(data.body,0,6000)||typeof data.visible!=='boolean')deny('INVALID_SECTION',400);
  const {expectedRevision,...d}=data;return {revision:expectedRevision,data:d};
 }
 if(kind==='item'){
  if(!shape(data,['expectedRevision','order','title','description','url','visible'])||!int(data.expectedRevision,1,1000000000)||!int(data.order,0,1000)||!text(data.title,0,160)||!text(data.description,0,2000)||!urlValid(data.url)||typeof data.visible!=='boolean')deny('INVALID_ITEM',400);
  const {expectedRevision,...d}=data;return {revision:expectedRevision,data:d};
 }
 if(kind==='publish'){
  if(!shape(data,['expectedRevision'])||!int(data.expectedRevision,1,1000000000))deny('INVALID_PUBLISH',400);
  return {revision:data.expectedRevision,data:{}};
 }
 deny('INVALID_OPERATION',400);
}
function responseWrite(raw,target){if(!shape(raw,['id','revision','status'])||raw.id!==target||!int(raw.revision,1,1000000000)||!['draft','published'].includes(raw.status))deny('UPSTREAM_DATA_INVALID',502);return raw;}
function responseList(raw){if(!shape(raw,['items'])||!Array.isArray(raw.items)||raw.items.length>50)deny('UPSTREAM_DATA_INVALID',502);
 const ids=new Set(),slugs=new Set();for(const p of raw.items){if(!shape(p,['id','slug','title','status','draftRevision','publishedRevision'])||!uid(p.id)||ids.has(p.id)||!validSlug(p.slug)||slugs.has(p.slug)||!text(p.title,2,160)||!['draft','published','archived'].includes(p.status)||!int(p.draftRevision,1,1000000000)||!(p.publishedRevision===null||int(p.publishedRevision,1,p.draftRevision)))deny('UPSTREAM_DATA_INVALID',502);ids.add(p.id);slugs.add(p.slug);}return raw;}
function sections(items,publicOnly){if(!Array.isArray(items)||items.length>60)deny('UPSTREAM_DATA_INVALID',502);const ids=new Set(),order=new Set();for(const s of items){const keys=publicOnly?['id','kind','order','heading','body','items']:['id','kind','order','heading','body','visible','items'];if(!shape(s,keys)||!uid(s.id)||ids.has(s.id)||!kinds.has(s.kind)||!int(s.order,0,1000)||order.has(s.order)||!text(s.heading,0,160)||!text(s.body,0,6000)||!Array.isArray(s.items)||s.items.length>100||!publicOnly&&typeof s.visible!=='boolean')deny('UPSTREAM_DATA_INVALID',502);ids.add(s.id);order.add(s.order);
 const itemIds=new Set(),itemOrders=new Set();for(const x of s.items){const ik=publicOnly?['id','order','title','description','mediaId','url']:['id','order','title','description','mediaId','url','visible'];if(!shape(x,ik)||!uid(x.id)||itemIds.has(x.id)||!int(x.order,0,1000)||itemOrders.has(x.order)||!text(x.title,0,160)||!text(x.description,0,2000)||x.mediaId!==null||!urlValid(x.url)||!publicOnly&&typeof x.visible!=='boolean')deny('UPSTREAM_DATA_INVALID',502);itemIds.add(x.id);itemOrders.add(x.order);}}
 return items;}
function detail(raw,target){if(raw===null)return null;
 if(!shape(raw,['id','slug','title','seoTitle','seoDescription','status','draftRevision','publishedRevision','sections'])||raw.id!==target||!validSlug(raw.slug)||!text(raw.title,2,160)||!text(raw.seoTitle,2,160)||!text(raw.seoDescription,0,300)||!['draft','published','archived'].includes(raw.status)||!int(raw.draftRevision,1,1000000000)||!(raw.publishedRevision===null||int(raw.publishedRevision,1,raw.draftRevision)))deny('UPSTREAM_DATA_INVALID',502);sections(raw.sections,false);return raw;}
function publicPage(raw,requested){if(raw===null)return null;if(!shape(raw,['schemaVersion','slug','revision','title','seoTitle','seoDescription','sections'])||raw.schemaVersion!==1||raw.slug!==requested||!int(raw.revision,1,1000000000)||!text(raw.title,2,160)||!text(raw.seoTitle,2,160)||!text(raw.seoDescription,0,300))deny('UPSTREAM_DATA_INVALID',502);sections(raw.sections,true);return raw;}
function settings(raw){if(raw===null)return null;if(!shape(raw,['revision','settings'])||!int(raw.revision,1,1000000000)||!own(raw.settings))deny('UPSTREAM_DATA_INVALID',502);
 const x=raw.settings,keys=['siteTitle','tagline','contactEmail','contactPhone','footerText','logoMediaId'];if(!shape(x,keys)||!text(x.siteTitle,2,160)||!text(x.tagline,0,160)||!text(x.contactEmail,3,254)||!text(x.footerText,0,1000)||!(x.contactPhone===null||text(x.contactPhone,7,20))||!(x.logoMediaId===null||uid(x.logoMediaId)))deny('UPSTREAM_DATA_INVALID',502);return raw;}
const kindMap={create:'page.create',update:'page.update',section:'section.upsert',item:'item.upsert',publish:'page.publish'};
export function createCmsRoute(kind,{verify,call}={}){
 if(!['list','detail','create','update','section','item','publish','publicPage','settings'].includes(kind)||typeof call!=='function'||!['publicPage','settings'].includes(kind)&&typeof verify!=='function')throw Error('INVALID_CMS_PORT');
 return async function handler(req,ctx={}){
  try{
   const method=['list','detail','publicPage','settings'].includes(kind)?'GET':kind==='update'?'PATCH':kind==='section'||kind==='item'?'PUT':'POST';
   if(!(req instanceof Request)||req.method!==method)deny('METHOD_NOT_ALLOWED',405);
   if(new URL(req.url).search)deny('INVALID_QUERY',400);
   const params=await ctx.params||{},id=kind==='detail'||kind==='update'||kind==='publish'?params.pageId:kind==='section'||kind==='item'?params.sectionId:kind==='publicPage'?params.slug:null;
   if(['detail','update','section','item','publish'].includes(kind)&&!uid(params.pageId)||['section','item'].includes(kind)&&!uid(params.sectionId)||kind==='item'&&!uid(params.itemId)||kind==='publicPage'&&!validSlug(id))deny('INVALID_RESOURCE_ID',400);
   const token=['publicPage','settings'].includes(kind)?null:bearer(req);
   if(token){const actor=await verify(token);if(!actor||actor.verified!==true||actor.role!=='teacher'||actor.accountStatus!=='active'||!uid(actor.userId))deny('FORBIDDEN',403);}
   let args={};let expectedTarget=null;
   if(['create','update','section','item','publish'].includes(kind)){
    const op=routeKey(req),payload=validateWrite(kind,await body(req));
    const target=kind==='create'?payload.id:kind==='section'?params.sectionId:kind==='item'?params.itemId:params.pageId;
    expectedTarget=target;args={p_action:kindMap[kind],p_target:target,p_parent:['section','item'].includes(kind)?params.pageId:null,p_expected_revision:payload.revision??null,
      p_data:kind==='item'?{...payload.data,sectionId:params.sectionId}:payload.data,p_operation_id:op};
   }else if(kind==='detail')args={p_page_id:params.pageId};else if(kind==='publicPage')args={p_slug:params.slug};
   const name=['create','update','section','item','publish'].includes(kind)?'coaching_cms_write':
     {list:'coaching_cms_list_pages',detail:'coaching_cms_get_page',publicPage:'coaching_cms_get_published_page',settings:'coaching_cms_get_published_settings'}[kind];
   const raw=await call(name,token,args);
   let data;if(expectedTarget)data=responseWrite(raw,expectedTarget);else if(kind==='list')data=responseList(raw);else if(kind==='detail')data=detail(raw,params.pageId);else if(kind==='publicPage')data=publicPage(raw,params.slug);else data=settings(raw);
   if((kind==='detail'||kind==='publicPage')&&data===null)deny('NOT_FOUND',404);
   return send(kind==='create'?201:200,{success:true,data});
  }catch(e){if(e?.code&&[400,401,403,404,405,413,415,502].includes(e.status))return send(e.status,{success:false,error:{code:e.code}});return send(503,{success:false,error:{code:'SERVICE_UNAVAILABLE'}});}
 };
}
