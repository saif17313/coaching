import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cmsRequest,cmsFetch,CMS_KINDS,validateCmsPage} from '../src/client/cms-studio.mjs';
const root='src/components/portal/WebsiteAdminStudio.tsx';
const a='f45c2a40-b451-478c-b23a-86df31b09215',b='f45c2a40-b451-478c-b23a-86df31b09216',c='f45c2a40-b451-478c-b23a-86df31b09217';
const page={id:a,slug:'home',title:'Musa Sir',seoTitle:'Musa Sir',seoDescription:'',status:'draft',draftRevision:2,publishedRevision:null,sections:[{id:b,order:0,kind:'hero',heading:'Learn',body:'World',visible:true,items:[{id:c,order:0,title:'Math',description:'Excellent',url:null,mediaId:null,visible:true}]}]};
const section={expectedRevision:2,kind:'hero',order:0,heading:'Welcome',body:'Every day.',visible:true};
const item={expectedRevision:2,order:0,title:'Math',description:'Algebra',url:null,visible:true};
const settings={siteTitle:'Musa Sir',tagline:'Welcome',contactEmail:'hello@example.com',contactPhone:null,footerText:'Learning since 2026',logoMediaId:null};
const okResponse=data=>({ok:true,status:200,headers:new Headers({'content-type':'application/json'}),json:async()=>({success:true,data})});

test('all 15 reviewed CMS section types available in the editing contract',()=>{assert.equal(CMS_KINDS.length,15);assert.ok(CMS_KINDS.includes('gallery'));assert.ok(CMS_KINDS.includes('academic-calendar'));});
test('section and item updates target parent/page UUID and require revision',()=>{
 const s=cmsRequest('section',{pageId:a,sectionId:b,payload:section});assert.equal(s.path,`/api/v1/teacher/website/pages/${a}/sections/${b}`);assert.equal(s.method,'PUT');
 const i=cmsRequest('item',{pageId:a,sectionId:b,itemId:c,payload:item});assert.equal(i.path,`/api/v1/teacher/website/pages/${a}/sections/${b}/items/${c}`);assert.equal(i.body.expectedRevision,2);
 assert.throws(()=>cmsRequest('item',{pageId:a,sectionId:b,itemId:c,payload:{...item,icon:'fake'}}),/Invalid item/);
 assert.throws(()=>cmsRequest('section',{pageId:a,sectionId:b,payload:{...section,order:-1}}),/Invalid section/);
});
test('rejects arbitrary URLs, stale revisions, unreviewed settings fields and invalid logo IDs',()=>{
 assert.throws(()=>cmsRequest('item',{pageId:a,sectionId:b,itemId:c,payload:{...item,url:'javascript:alert(1)'}}),/Invalid/);
 assert.throws(()=>cmsRequest('section',{pageId:a,sectionId:b,payload:{...section,expectedRevision:0}}),/Invalid/);
 assert.throws(()=>cmsRequest('settingsUpdate',{payload:{expectedRevision:1,settings:{...settings,icon:'☁'}}}),/Invalid/);
 assert.throws(()=>cmsRequest('settingsUpdate',{payload:{expectedRevision:1,settings:{...settings,logoMediaId:'../../etc'}}}),/Invalid/);
 assert.equal(cmsRequest('settingsUpdate',{payload:{expectedRevision:1,settings:{...settings,logoMediaId:b}}}).body.settings.logoMediaId,b);
 assert.throws(()=>cmsRequest('settingsUpdate',{payload:{expectedRevision:1,settings:{...settings,footerText:'<script>'}}}),/Invalid/);
});
test('page publish, archive and global settings publication require exact optimistic revision',()=>{
 for(const kind of ['publish','archive'])assert.equal(cmsRequest(kind,{pageId:a,payload:{expectedRevision:2}}).method,'POST');
 assert.equal(cmsRequest('settingsPublish',{payload:{expectedRevision:2}}).path,'/api/v1/teacher/website/settings/publish');
 assert.throws(()=>cmsRequest('publish',{pageId:a,payload:{expectedRevision:2,force:true}}),/Invalid/);
 assert.throws(()=>cmsRequest('page',{pageId:'not-a-uuid'}),/Invalid/);
});
test('safe attachment cannot bypass page ID, item ID or verified image ID',()=>{
 const r=cmsRequest('attach',{pageId:a,itemId:c,mediaId:b,payload:{expectedRevision:2,mediaId:b}});
 assert.equal(r.method,'POST');assert.equal(r.path,`/api/v1/teacher/website/pages/${a}/items/${c}/media`);
 assert.throws(()=>cmsRequest('attach',{pageId:a,itemId:c,mediaId:'not-an-id',payload:{expectedRevision:2,mediaId:b}}),/Invalid/);
});
test('write command sends cookie-scoped request with receipt and CSRF marker, no bearer or service role',async()=>{
 const writes=[];
 const data=await cmsFetch('section',{pageId:a,sectionId:b,payload:section},async(path,init)=>{writes.push({path,init});return okResponse({id:b,revision:3,status:'draft'});},()=>c);
 assert.equal(writes.length,1);assert.equal(writes[0].init.credentials,'same-origin');assert.equal(writes[0].init.headers['Idempotency-Key'],c);
 assert.equal(writes[0].init.headers['x-musa-ui'],'1');assert.equal(writes[0].init.method,'PUT');assert.equal(writes[0].init.headers.Authorization,undefined);
 assert.equal(data.revision,3);
});
test('invalid request does not make network calls and provider failure is sanitized',async()=>{
 let count=0;const fetcher=async()=>{count++;return okResponse({});};
 await assert.rejects(()=>cmsFetch('item',{pageId:a,sectionId:b,itemId:'bad',payload:item},fetcher,()=>c));assert.equal(count,0);
 await assert.rejects(()=>cmsFetch('item',{pageId:a,sectionId:b,itemId:c,payload:item},async()=>({ok:false,status:503,json:async()=>({error:{code:'SENSITIVE_INTERNAL_DETAILS'}})}),()=>c),/Write service unavailable/);
});
test('draft page projection refuses duplicate section and item positions',()=>{
 assert.equal(validateCmsPage(page),page);
 assert.throws(()=>validateCmsPage({...page,sections:[page.sections[0],{...page.sections[0],id:c}]}),/Invalid section/);
 const copy=structuredClone(page);copy.sections[0].items.push({...copy.sections[0].items[0],id:a});assert.throws(()=>validateCmsPage(copy),/Invalid content/);
});
test('portal uses Studio and public 3D visual motion respects reduced-motion',()=>{
 const portal=readFileSync('src/components/portal/PortalClient.tsx','utf8');
 const ui=readFileSync(root,'utf8');const css=readFileSync('src/app/globals.css','utf8');
 assert.match(portal,/<WebsiteAdminStudio(?:\s|\/>)/);assert.match(ui,/CmsContextWorkspace/);const workspace=readFileSync('src/components/portal/CmsContextWorkspace.tsx','utf8');assert.match(workspace,/CmsLivePreview/);assert.match(workspace,/Global identity/);assert.match(ui,/visible/);assert.match(ui,/x-musa-ui/);
 assert.match(css,/musa-orbit/);assert.match(css,/prefers-reduced-motion/);
});
