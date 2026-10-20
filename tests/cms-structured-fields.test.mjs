import test from 'node:test';
import assert from 'node:assert/strict';
import {CMS_FORMS,validateCmsFields,formForTarget} from '../src/client/cms-fields.mjs';
import {createCmsFieldsRoute} from '../src/server/http/cms-fields-route.mjs';
import {createCmsRoute} from '../src/server/http/cms-core.mjs';
import {WEBSITE_MENU,getWebsiteTarget} from '../src/client/reference-website-nav.mjs';
const page='8950c167-84fc-4734-a66d-4015a2d370d1',section='8950c167-84fc-4734-a66d-4015a2d370d2',operation='8950c167-84fc-4734-a66d-4015a2d370d3';
const actor={verified:true,userId:page,role:'teacher',accountStatus:'active'};
const payload={sectionKey:'HOME_HERO',content:{headline:'DEMO headline',teacherName:'DEMO educator',features:['Guided learning'],primaryCtaUrl:'/site/courses'},itemId:null,expectedRevision:2};
const context={params:Promise.resolve({pageId:page,sectionId:section})};
const request=(body=payload)=>new Request('https://app.example/fields',{method:'PUT',headers:{Authorization:'Bearer aaa.bbb.ccc','Content-Type':'application/json','Idempotency-Key':operation},body:JSON.stringify(body)});
test('42 field schemas retain semantic hero, portfolio, contact, gallery and article fields',()=>{
 assert.equal(Object.keys(CMS_FORMS).length,42);
 assert.ok(validateCmsFields('HOME_HERO',payload.content));
 assert.ok(validateCmsFields('CONTACT_INFO',{address:'DEMO address',mapEmbedUrl:'https://maps.google.com/maps?q=education'}));
 assert.ok(validateCmsFields('GALLERY_ALBUMS',{images:[{mediaId:page,alt:'DEMO educational photograph'}]},true));
 assert.ok(validateCmsFields('NEWS_EVENTS_ITEMS',{fullContent:'DEMO long article',category:'Learning'},true));
 assert.equal(formForTarget({slug:'home',kind:'hero',label:'Hero'}),'HOME_HERO');
});
test('every content sidebar target resolves its dedicated semantic schema and kind',()=>{
 for(const entry of WEBSITE_MENU.flatMap(group=>group.items).filter(entry=>entry.kind)){
  const target=getWebsiteTarget(entry.id);assert.ok(CMS_FORMS[target.schemaKey],entry.id);assert.equal(target.kind,CMS_FORMS[target.schemaKey].kind,entry.id);
 }
 assert.equal(getWebsiteTarget('about-page-education-timeline').schemaKey,'ABOUT_EDUCATION');
 assert.equal(getWebsiteTarget('about-page-industrial-training-banner').schemaKey,'ABOUT_TRAINING');
 assert.equal(getWebsiteTarget('about-page-projects-grid').schemaKey,'ABOUT_PROJECTS');
});

test('portfolio schemas retain reference nesting and legacy training without accepting unsafe media',()=>{
 assert.ok(validateCmsFields('ABOUT_EDUCATION',{education:[{id:'DEMO education',degree:'DEMO degree',institution:'DEMO institute',year:'2026',gpa:'DEMO grade',status:'DEMO',displayOrder:1}]}));
 assert.ok(validateCmsFields('ABOUT_RESEARCH_EXP',{researchData:[{title:'DEMO research',type:'Thesis',supervisor:'DEMO supervisor',coSupervisors:'DEMO',summary:'DEMO',focusArea:'DEMO',techniques:'DEMO',outcome:'DEMO',iconName:'Book'}]}));
 assert.ok(validateCmsFields('ABOUT_PUBLICATIONS',{publications:[{title:'DEMO paper',type:'Journal Article',venue:'DEMO journal',doiLink:'https://doi.org/10.0000/demo',summary:'DEMO'}]}));
 assert.ok(validateCmsFields('ABOUT_PROJECTS',{projects:[{title:'DEMO project',imageUrl:page,technologies:['Physics'],metrics:[{label:'DEMO',value:'1'}],actionLinks:[{label:'Read',url:'/site/projects',variant:'outline'}],displayOrder:1}]}));
 assert.ok(validateCmsFields('ABOUT_SKILLS',{skills:[{title:'DEMO skills',skills:['Physics','Mathematics'],progress:'DEMO'}]}));
 assert.ok(validateCmsFields('ABOUT_TRAINING',{training:{title:'DEMO training',organization:'DEMO institute',features:[{label:'DEMO feature',iconName:'Book'}],certificateUrl:page}}));
 assert.ok(validateCmsFields('ABOUT_TRAINING',{training:[{title:'Legacy training entry',description:'Preserved'}]}));
 assert.equal(validateCmsFields('ABOUT_TRAINING',{training:{certificateUrl:'https://external.test/certificate.png'}}),false);
 assert.equal(validateCmsFields('ABOUT_PUBLICATIONS',{publications:[{doiLink:'javascript:alert(1)'}]}),false);
});
test('typed fields reject foreign keys, unsafe links, forged media, unknown data, overlong text and rating range',()=>{
 for(const content of [{headline:'x'.repeat(161)},{headline:'\u0000'},{teacherImage:'https://example.com/fake-person.png'},{primaryCtaUrl:'javascript:alert(1)'},{primaryCtaUrl:'//external.test'},{primaryCtaUrl:'https://user:password@example.com'},{password:'unexpected'}])assert.equal(validateCmsFields('HOME_HERO',content),false);
 assert.equal(validateCmsFields('HOME_FEATURED_COURSES',{selectedCourseIds:[page,page]}),false);
 assert.equal(validateCmsFields('HOME_FEATURED_COURSES',{selectedCourseIds:['']}),false);
 assert.equal(validateCmsFields('REVIEWS_ITEMS',{rating:6},true),false);
});
test('Teacher field mutation uses exact IDs, revision, schema and idempotency key',async()=>{
 const calls=[];const route=createCmsFieldsRoute({verify:async()=>actor,call:async(...args)=>{calls.push(args);return {id:section,revision:3,status:'published'};}});
 const response=await route(request(),context);assert.equal(response.status,200);assert.equal(calls[0][0],'coaching_cms_fields_write');
 assert.deepEqual(calls[0][2],{p_page_id:page,p_section_id:section,p_item_id:null,p_section_key:'HOME_HERO',p_content:payload.content,p_expected_revision:2,p_operation_id:operation});
});
test('Student and inactive Teacher never reach the typed RPC',async()=>{
 let calls=0;
 for(const who of [{...actor,role:'student'},{...actor,accountStatus:'pending'}]){
  const route=createCmsFieldsRoute({verify:async()=>who,call:async()=>{calls++;}});
  assert.equal((await route(request(),context)).status,403);
 }assert.equal(calls,0);
});
test('schema validation rejects a malformed payload before RPC and sanitizes unexpected upstream fields',async()=>{
 let calls=0;const route=createCmsFieldsRoute({verify:async()=>actor,call:async()=>{calls++;return {id:section,revision:3,status:'draft',private:'secret'};}});
 assert.equal((await route(request({...payload,content:{private:'secret'}}),context)).status,400);assert.equal(calls,0);
 assert.equal((await route(request(),context)).status,502);
});
test('published DTO accepts typed fields but refuses unreviewed properties',async()=>{
 const value={schemaVersion:1,slug:'home',revision:3,title:'DEMO home',seoTitle:'DEMO home',seoDescription:'',sections:[{id:section,kind:'hero',order:0,heading:'DEMO',body:'',items:[],sectionKey:'HOME_HERO',content:payload.content}]};
 const route=raw=>createCmsRoute('publicPage',{call:async()=>raw});
 const req=new Request('https://app.example/api/v1/public/site-pages/home'),ctx={params:Promise.resolve({slug:'home'})};
 assert.equal((await route(value)(req,ctx)).status,200);
 assert.equal((await route({...value,sections:[{...value.sections[0],content:{...payload.content,secret:'leak'}}]})(req,ctx)).status,502);
});
