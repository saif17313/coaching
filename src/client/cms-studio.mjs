/** Part P: validated request boundary for the teacher CMS. Uses existing proxy/JWT/RPC routes. */
import {validateCmsFields} from './cms-fields.mjs';
import {validOrganization} from './cms-order.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG=/^[a-z][a-z0-9-]{1,62}$/;
export const CMS_KINDS=['hero','rich-text','cards','gallery','results','courses','contact','cta','faq','news','reviews','academic-calendar','routine','materials','footer'];
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const exact=(x,fields)=>plain(x)&&Object.keys(x).length===fields.length&&fields.every(k=>has(x,k));
const string=(x,max,min=0)=>typeof x==='string'&&x.trim().length>=min&&x.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(x);
const revision=x=>Number.isSafeInteger(x)&&x>=0&&x<=1e9;
const id=x=>typeof x==='string'&&UUID.test(x);
function validUrl(x){if(x===null)return true;try{const a=new URL(x);return typeof x==='string'&&x.length<=2048&&a.protocol==='https:'&&!a.username&&!a.password&&!a.hash&&Boolean(a.hostname);}catch{return false;}}
function err(s){throw Error(s);}
export class CmsRequestError extends Error {
 constructor(code,status,message){super(message);this.name='CmsRequestError';this.code=code;this.status=status;}
}
export function cmsResponseError(status,value){
 const code=typeof value?.error?.code==='string'&&/^[A-Z0-9_]{2,80}$/.test(value.error.code)?value.error.code:'REQUEST_FAILED';
 const messages={
  MUTATIONS_DISABLED:'The running server is read-only. Start RUN_EDUCENTRE_DEV_WRITES.ps1 -Start to enable the reviewed DEV gate.',
  ALREADY_PUBLISHED:'This saved revision is already published. Save your changes as a draft before publishing.',
  REVISION_CONFLICT:'Another edit changed this record. Reload the latest draft and review your changes before saving again.',
  IDEMPOTENCY_CONFLICT:'This operation ID was already used for different changes. Reload and review the operation before retrying.',
  CMS_RPC_UNAVAILABLE:'The CMS database function is unavailable. Verify the installed Supabase migrations; restarting the server will not repair a missing function.',
  CMS_PERMISSION_DENIED:'The database denied access to this CMS operation. Review the RPC grants and active Teacher permissions.',
  MEDIA_PUBLIC_IN_USE:'This image is in published content. Remove it and publish that change before archiving it.',
  MEDIA_DRAFT_IN_USE:'This image is attached to draft content. Remove the attachment before archiving it.',
  MEDIA_NOT_VERIFIED:'The selected media could not be verified in Storage. Choose a verified image before publishing.',
  SECTION_KEY_REQUIRED:'Save the section’s content form before editing its individual content details.',
  INVALID_CONTENT_REFERENCE:'Choose records that are currently published in the corresponding source page.',
 };
 const message=messages[code]??(status===401?'Session expired. Sign in again.':status===403?'Access denied. Confirm active teacher account.':status===503?'Write service unavailable. Supabase could not complete the request. Recheck backend access; the runtime gate alone does not prove a mutation can succeed.':status===409?'The record changed or conflicts with existing content. Reload and review before retrying.':status===400?'Invalid input. Check the field values and try again.':`Request failed (${status}).`);
 return new CmsRequestError(code,status,message);
}
function validSettings(x){return exact(x,['siteTitle','tagline','contactEmail','contactPhone','footerText','logoMediaId'])&&string(x.siteTitle,160,2)&&string(x.tagline,160)&&string(x.footerText,1000)&&!/[<>]/.test(x.siteTitle+x.tagline+x.footerText)&&string(x.contactEmail,254,3)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.contactEmail)&&(x.contactPhone===null||string(x.contactPhone,20,7))&&(x.logoMediaId===null||id(x.logoMediaId));}
export function cmsRequest(kind,params={}){
 const {pageId,sectionId,itemId,mediaId,payload}=params;
 const root='/api/v1/teacher/website';
 const page=id(pageId)?`${root}/pages/${pageId}`:null;
 const s=id(sectionId)?`${page}/sections/${sectionId}`:null;
 const i=id(itemId)?`${s}/items/${itemId}`:null;
 if(['pageUpdate','publish','archive','section','item','attach','fields','organize'].includes(kind)&&!page)err('Select a valid page.');
 let method='GET',path='',body=null;
 switch(kind){
 case 'pages':path=`${root}/pages`;break;
 case 'media':path=`${root}/media`;break;
 case 'settings':path=`${root}/settings`;break;
 case 'page':if(!page)err('Invalid page ID.');path=page;break;
 case 'pageCreate':
  if(!exact(payload,['id','slug','title','seoTitle','seoDescription'])||!id(payload.id)||!SLUG.test(payload.slug)||payload.slug.endsWith('-')||payload.slug.includes('--')||!string(payload.title,160,2)||!string(payload.seoTitle,160,2)||!string(payload.seoDescription,300))err('Invalid new page fields.');
  method='POST';path=`${root}/pages/create`;body=payload;break;
 case 'pageUpdate':
  if(!exact(payload,['expectedRevision','title','seoTitle','seoDescription'])||!revision(payload.expectedRevision)||payload.expectedRevision===0||!string(payload.title,160,2)||!string(payload.seoTitle,160,2)||!string(payload.seoDescription,300))err('Invalid page details.');
  method='PATCH';path=`${page}/edit`;body=payload;break;
 case 'publish':case 'archive':
  if(!exact(payload,['expectedRevision'])||!revision(payload.expectedRevision)||payload.expectedRevision===0)err('Invalid revision.');
  method='POST';path=`${page}/${kind}`;body=payload;break;
 case 'section':
  if(!s||!exact(payload,['expectedRevision','kind','order','heading','body','visible'])||!revision(payload.expectedRevision)||payload.expectedRevision===0||!CMS_KINDS.includes(payload.kind)||!Number.isSafeInteger(payload.order)||payload.order<0||payload.order>1000||!string(payload.heading,160)||!string(payload.body,6000)||typeof payload.visible!=='boolean')err('Invalid section fields.');
  method='PUT';path=s;body=payload;break;
 case 'item':
  if(!i||!exact(payload,['expectedRevision','order','title','description','url','visible'])||!revision(payload.expectedRevision)||payload.expectedRevision===0||!Number.isSafeInteger(payload.order)||payload.order<0||payload.order>1000||!string(payload.title,160)||!string(payload.description,2000)||!validUrl(payload.url)||typeof payload.visible!=='boolean')err('Invalid item fields.');
  method='PUT';path=i;body=payload;break;
 case 'fields':
  if(!s||!exact(payload,['sectionKey','content','itemId','expectedRevision'])||!revision(payload.expectedRevision)||payload.expectedRevision===0||payload.itemId!==null&&!id(payload.itemId)||!validateCmsFields(payload.sectionKey,payload.content,payload.itemId!==null))err('Invalid structured content fields.');
  method='PUT';path=`${s}/fields`;body=payload;break;
 case 'organize':
  if(!validOrganization(payload))err('Invalid content ordering or attachment selection.');
  method='POST';path=`${page}/organize`;body=payload;break;
 case 'mediaArchive':
  if(!id(mediaId))err('Invalid media ID.');
  method='POST';path=`${root}/media/${mediaId}/archive`;body={};break;
 case 'attach':
  if(!id(itemId)||!id(mediaId)||!exact(payload,['expectedRevision','mediaId'])||payload.mediaId!==mediaId||!revision(payload.expectedRevision)||payload.expectedRevision===0)err('Invalid image selection.');
  method='POST';path=`${page}/items/${itemId}/media`;body=payload;break;
 case 'settingsUpdate':
  if(!exact(payload,['expectedRevision','settings'])||!revision(payload.expectedRevision)||!validSettings(payload.settings))err('Invalid global settings.');
  method='PUT';path=`${root}/settings/draft`;body=payload;break;
 case 'settingsPublish':
  if(!exact(payload,['expectedRevision'])||!revision(payload.expectedRevision)||payload.expectedRevision===0)err('Invalid settings revision.');
  method='POST';path=`${root}/settings/publish`;body=payload;break;
 default:err('Unknown CMS operation.');
 }
 return {path,method,body};
}
export async function cmsFetch(kind,params={},fetcher=globalThis.fetch,uuid=globalThis.crypto?.randomUUID?.bind(globalThis.crypto)){
 const r=cmsRequest(kind,params);const headers={};
 if(r.method!=='GET'){
  if(typeof uuid!=='function')err('Secure operation ID unavailable.');
  const key=uuid();if(!id(key))err('Invalid operation receipt.');
  headers['x-musa-ui']='1';headers['Idempotency-Key']=key;headers['Content-Type']='application/json';
 }
 const result=await fetcher(r.path,{method:r.method,cache:'no-store',credentials:'same-origin',headers,...(r.body!==null?{body:JSON.stringify(r.body)}:{})});
 let value;try{value=await result.json();}catch{err('Invalid server response.');}
 if(!result.ok)throw cmsResponseError(result.status,value);
 if(value?.success!==true||!has(value,'data'))err('Unexpected response envelope.');
 return value.data;
}
export function validateCmsPage(x){
 if(!plain(x)||!id(x.id)||!SLUG.test(x.slug)||!string(x.title,160,2)||!revision(x.draftRevision)||x.draftRevision===0||!Array.isArray(x.sections)||x.sections.length>60)err('Invalid page response.');
 const sections=new Set(),orders=new Set();
 for(const s of x.sections){if(!plain(s)||!id(s.id)||sections.has(s.id)||orders.has(s.order)||!CMS_KINDS.includes(s.kind)||!string(s.heading,160)||!string(s.body,6000)||typeof s.visible!=='boolean'||!Number.isSafeInteger(s.order)||s.order<0||s.order>1000||!Array.isArray(s.items)||s.items.length>100)err('Invalid section response.');sections.add(s.id);orders.add(s.order);
 const items=new Set(),ranks=new Set();for(const item of s.items){if(!plain(item)||!id(item.id)||items.has(item.id)||ranks.has(item.order)||!Number.isSafeInteger(item.order)||item.order<0||item.order>1000||!string(item.title,160)||!string(item.description,2000)||typeof item.visible!=='boolean'||!(item.mediaId===null||id(item.mediaId))||!validUrl(item.url))err('Invalid content item.');items.add(item.id);ranks.add(item.order);}}
 return x;
}
