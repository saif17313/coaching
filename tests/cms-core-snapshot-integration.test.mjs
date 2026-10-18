import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createCmsRoute} from '../src/server/http/cms-core.mjs';
const teacher={verified:true,userId:'11111111-1111-4111-8111-111111111111',role:'teacher',accountStatus:'active'};
const student={...teacher,role:'student'};
const ids={page:'22222222-2222-4222-8222-222222222222',section:'33333333-3333-4333-8333-333333333333',item:'44444444-4444-4444-8444-444444444444'};
const op='55555555-5555-4555-8555-555555555555', bearer='aaa.bbb.ccc';
const jwtHeaders={Authorization:`Bearer ${bearer}`};
const newPage={id:ids.page,slug:'home',title:'Musa Sir',seoTitle:'Musa Sir Coaching',seoDescription:'About classes'};
const sec={expectedRevision:1,kind:'hero',order:0,heading:'Learn',body:'With us',visible:true};
const item={expectedRevision:2,order:0,title:'Learn Now',description:'Find a class',url:'https://example.com',visible:true};
const section={id:ids.section,kind:'hero',order:0,heading:'Learn',body:'With us',visible:true,items:[{id:ids.item,order:0,title:'Learn Now',description:'Find a class',mediaId:null,url:'https://example.com',visible:true}]};
const snapshot={schemaVersion:1,slug:'home',revision:3,title:'Musa Sir',seoTitle:'Musa Sir Coaching',seoDescription:'About classes',sections:[{...section,visible:undefined,items:section.items.map(({visible,...i})=>i)}]};delete snapshot.sections[0].visible;
const detail={id:ids.page,slug:'home',title:'Musa Sir',seoTitle:'Musa Sir Coaching',seoDescription:'About classes',status:'draft',draftRevision:3,publishedRevision:null,sections:[section]};
const urls={list:'/api/v1/teacher/website/pages',detail:`/api/v1/teacher/website/pages/${ids.page}`,create:'/api/v1/teacher/website/pages/create',update:`/api/v1/teacher/website/pages/${ids.page}/edit`,section:`/api/v1/teacher/website/pages/${ids.page}/sections/${ids.section}`,item:`/api/v1/teacher/website/pages/${ids.page}/sections/${ids.section}/items/${ids.item}`,publish:`/api/v1/teacher/website/pages/${ids.page}/publish`,publicPage:'/api/v1/public/site-pages/home',settings:'/api/v1/public/site-settings'};
const ctx={params:Promise.resolve({pageId:ids.page,sectionId:ids.section,itemId:ids.item,slug:'home'})};
const methods={list:'GET',detail:'GET',create:'POST',update:'PATCH',section:'PUT',item:'PUT',publish:'POST',publicPage:'GET',settings:'GET'};
const bodies={create:newPage,update:{expectedRevision:1,title:'Musa Sir Today'},section:sec,item,publish:{expectedRevision:3}};
const results={list:{items:[{id:ids.page,slug:'home',title:'Musa Sir',status:'draft',draftRevision:3,publishedRevision:null}]},detail,create:{id:ids.page,revision:1,status:'draft'},update:{id:ids.page,revision:2,status:'draft'},section:{id:ids.section,revision:2,status:'draft'},item:{id:ids.item,revision:3,status:'draft'},publish:{id:ids.page,revision:3,status:'published'},publicPage:snapshot,settings:null};
const calls=[];const api=(kind,actor=teacher,returned=results[kind])=>createCmsRoute(kind,{verify:async token=>{assert.equal(token,bearer);return actor;},call:async(name,token,args)=>{calls.push({kind,name,token,args});return returned;}});
function req(kind,body=bodies[kind],headers={}){return new Request('https://app.example'+urls[kind],{method:methods[kind],headers:{...(!['publicPage','settings'].includes(kind)?jwtHeaders:{}),...(body!==undefined?{'Content-Type':'application/json','idempotency-key':op}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});}
for(const kind of Object.keys(urls)){
 test(`cms ${kind}: expected response and no private rows`,async()=>{
  calls.length=0;const r=await api(kind)(req(kind),ctx);const b=await r.json();assert.equal(r.status,kind==='create'?201:200,JSON.stringify(b));assert.equal(b.success,true);assert.deepEqual(b.data,results[kind]);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(calls.length,1);
  const c=calls[0];assert.equal(c.token,['settings','publicPage'].includes(kind)?null:bearer);
  assert.equal(c.name,['create','update','section','item','publish'].includes(kind)?'coaching_cms_write':{list:'coaching_cms_list_pages',detail:'coaching_cms_get_page',publicPage:'coaching_cms_get_published_page',settings:'coaching_cms_get_published_settings'}[kind]);
 });
}
test('CMS writer request maps page/section/item and expected revision into one audited RPC',async()=>{
 for(const k of ['create','update','section','item','publish']){calls.length=0;await api(k)(req(k),ctx);const x=calls[0].args;assert.equal(x.p_operation_id,op);assert.equal(x.p_target,k==='section'?ids.section:k==='item'?ids.item:ids.page);assert.equal(x.p_parent,['section','item'].includes(k)?ids.page:null);assert.equal(x.p_action,{create:'page.create',update:'page.update',section:'section.upsert',item:'item.upsert',publish:'page.publish'}[k]);}
});
test('CMS teacher permissions deny student/disabled actor before RPC',async()=>{
 for(const k of ['list','detail','create','update','section','item','publish']){
  calls.length=0;for(const actor of [student,{...teacher,accountStatus:'disabled'},null]){const r=await api(k,actor)(req(k),ctx);assert.equal(r.status,403,k);assert.equal(calls.length,0);}
 }
});
test('Missing bearer token is 401 and never calls RPC',async()=>{
 for(const k of ['list','detail','create','publish']){calls.length=0;const r=await api(k)(req(k,bodies[k],{Authorization:''}),ctx);assert.equal(r.status,401);assert.equal(calls.length,0);}
});
test('Unsafe and unrecognized query, method and route IDs rejected before RPC',async()=>{
 const h=api('list');calls.length=0;assert.equal((await h(new Request('https://app.example'+urls.list+'?secret=x',{headers:jwtHeaders}),ctx)).status,400);assert.equal(calls.length,0);
 assert.equal((await api('publish')(new Request('https://app.example'+urls.publish,{method:'GET',headers:jwtHeaders}),ctx)).status,405);
 assert.equal((await api('detail')(req('detail'),{params:Promise.resolve({pageId:'foreign'})})).status,400);
});
test('Invalid page slug, SQL-like metadata, bad title, overlong text denied',async()=>{
 for(const patch of [{slug:'HOME'},{slug:'a--b'},{title:'A'},{title:'X'.repeat(161)},{seoDescription:'X'.repeat(301)},{admin:true}]){
  calls.length=0;assert.equal((await api('create')(req('create',{...newPage,...patch}),ctx)).status,400);assert.equal(calls.length,0);
 }
});
test('HTML media content cannot be attached without reviewed storage gate',async()=>{
 const r=await api('item')(req('item',{...item,mediaId:ids.item}),ctx);assert.equal(r.status,400);
});
test('Invalid section kind/duplicate field and unsafe item URL rejected',async()=>{
 for(const [kind,b] of [['section',{...sec,kind:'javascript'}],['section',{...sec,order:-1}],['section',{...sec,visible:'yes'}],['item',{...item,url:'javascript:alert(1)'}],['item',{...item,url:'https://user:password@example.com'}],['item',{...item,order:1001}]]){
  calls.length=0;assert.equal((await api(kind)(req(kind,b),ctx)).status,400);assert.equal(calls.length,0);
 }
});
test('Mutations require UUID Idempotency-Key, JSON media type and strict body',async()=>{
 for(const k of ['create','update','section','item','publish']){
  calls.length=0;assert.equal((await api(k)(req(k,bodies[k],{'idempotency-key':'bad'}),ctx)).status,400);
  assert.equal((await api(k)(req(k,bodies[k],{'Content-Type':'text/plain','idempotency-key':op}),ctx)).status,415);
  assert.equal(calls.length,0);
 }
});
test('Public page never allows draft or poisoned snapshots',async()=>{
 for(const poisoned of [{...snapshot,secret:'draft'}, {...snapshot,slug:'another'}, {...snapshot,sections:[{...snapshot.sections[0],items:[{...snapshot.sections[0].items[0],storageKey:'secret'}]}]}, {...snapshot,sections:[{...snapshot.sections[0],items:[{...snapshot.sections[0].items[0],mediaId:"NOT_A_UUID"}]}]}]){
  assert.equal((await api('publicPage',teacher,poisoned)(req('publicPage'),ctx)).status,502);
 }
 assert.equal((await api('publicPage',teacher,null)(req('publicPage'),ctx)).status,404);
});
test('Teacher draft read refuses unexpected/private fields',async()=>{
 assert.equal((await api('detail',teacher,{...detail,createdBy:ids.page})(req('detail'),ctx)).status,502);
 assert.equal((await api('list',teacher,{items:[{...results.list.items[0],password:'leak'}]})(req('list'),ctx)).status,502);
});
test('Public settings output has restricted keys and never exposes draft',async()=>{
 assert.equal((await api('settings',teacher,{revision:1,settings:{draft:true}})(req('settings'),ctx)).status,502);
});
test('Storage and table privileges are never exposed by CMS route implementation',()=>{
 const sql=fs.readFileSync('supabase/migrations/20261018001400_cms_core_drafts_and_published_snapshots.sql','utf8');
 assert.match(sql,/create function public.coaching_cms_write/);assert.match(sql,/security definer set search_path = ''/);
 assert.match(sql,/coaching_mutation_receipts/);assert.match(sql,/public\.audit_logs/);
 assert.match(sql,/grant execute on function public\.coaching_cms_get_published_page\(text\) to anon,authenticated/);
 assert.doesNotMatch(sql,/grant\s+(insert|update|delete|all)\s+on\s+(table\s+)?public\.(site_pages|site_page_sections|site_section_items)/i);
 const gateway=fs.readFileSync('src/server/http/production-cms-core.ts','utf8');assert.match(gateway,/COACHING_ENABLE_MUTATION_APIS/);assert.doesNotMatch(gateway,/SERVICE_ROLE/);
});
