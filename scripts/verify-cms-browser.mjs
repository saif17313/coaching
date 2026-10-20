/** Uses a manually signed-in, isolated browser. Never reads or writes session tokens. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const modulePath=process.env.EDUCENTRE_PLAYWRIGHT_MODULE;
if(!modulePath)throw Error('Set EDUCENTRE_PLAYWRIGHT_MODULE to an installed playwright index.mjs.');
if(!/^SUPABASE_URL\s*=\s*["']?https:\/\/rkpwqgwceekuvlizfpeb\.supabase\.co\/?["']?\s*$/m.test(readFileSync('.env.local','utf8')))throw Error('Reviewed DEV project mismatch.');
const {chromium}=await import(pathToFileURL(modulePath).href);
const browser=await chromium.connectOverCDP('http://127.0.0.1:'+(process.env.EDUCENTRE_CDP_PORT??'9333'));
const context=browser.contexts()[0],page=context.pages().find(p=>p.url().startsWith('http://localhost:3000/portal'));
if(!page)throw Error('Open the signed-in verification portal on localhost:3000.');
const report={project:'rkpwqgwceekuvlizfpeb',time:new Date().toISOString(),transport:'real browser cookie -> Next proxy -> verified Teacher -> Supabase RPC',checks:[],testPage:null};
const dir=resolve('docs/evidence',process.env.EDUCENTRE_EVIDENCE_DATE??'2026-10-20');mkdirSync(dir,{recursive:true});
function check(name,actual,expected){assert.deepEqual(actual,expected,name);report.checks.push({name,status:'Pass'});console.log('PASS '+name);}
async function api(path,method='GET',body,operationId){
 return page.evaluate(async({path,method,body,operationId})=>{
  const res=await fetch(path,{method,cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json','x-musa-ui':'1','Idempotency-Key':operationId??crypto.randomUUID()},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:res.status,body:await res.json()};
 },{path,method,body,operationId});
}
try{
 const ready=await api('/api/v1/teacher/website/write-status');check('active Teacher write gate and CMS read probe',ready.body.data?.writable,true);
 check('read probe does not claim mutation verification',ready.body.data?.mutationVerified,false);
 if(await page.getByRole('heading',{name:'Website Studio',exact:true}).count()===0)await page.getByRole('button',{name:'Website Admin',exact:true}).click();
 await page.locator('.studio-page-entry').first().waitFor();
 const stamp=Date.now().toString(36),slug='demo-audit-'+stamp,title='DEMO CMS audit '+stamp;
 await page.getByLabel('Slug',{exact:true}).fill(slug);await page.getByLabel('Title',{exact:true}).fill(title);
 const created=page.waitForResponse(r=>r.url().endsWith('/pages/create')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Create draft page',exact:true}).click();
 const createResponse=await created;check('UI create draft HTTP status',createResponse.status(),201);
 const receipt=(await createResponse.json()).data;report.testPage={id:receipt.id,slug};
 const root='/api/v1/teacher/website/pages/'+receipt.id;
 await page.getByRole('heading',{name:title,exact:true}).waitFor();
 check('unpublished draft absent from public API',(await api('/api/v1/public/site-pages/'+slug)).status,404);
 await page.getByLabel('Heading',{exact:true}).fill('DEMO saved introduction');
 await page.getByLabel('Description / paragraph',{exact:true}).fill('DEMO content for persistence verification. No real student claims.');
 const sectionSaved=page.waitForResponse(r=>r.url().includes(root+'/sections/')&&r.request().method()==='PUT');
 await page.getByRole('button',{name:'Add section',exact:true}).click();check('UI save section HTTP status',(await sectionSaved).status(),200);
 await page.locator('.portal-success').waitFor();
 let draft=(await api(root)).body.data;check('independent API draft read-back',draft.sections[0].heading,'DEMO saved introduction');
 check('draft still private after save',(await api('/api/v1/public/site-pages/'+slug)).status,404);
 await page.reload();await page.getByRole('button',{name:'Website Admin',exact:true}).click();
 await page.locator('.studio-page-entry').filter({hasText:title}).click();await page.getByRole('heading',{name:title,exact:true}).waitFor();
 check('editor refresh retrieves saved section',await page.locator('.studio-section-row').innerText().then(t=>t.includes('DEMO saved introduction')),true);
 // The browser is also attached to the launcher's Playwright connection, whose
 // default dialog handling races CDP clients. Confirm only this isolated test.
 await page.evaluate(()=>{window.confirm=()=>true;});
 const published=page.waitForResponse(r=>r.url()===('http://localhost:3000'+root+'/publish')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Publish page ↗',exact:true}).click();check('UI publication HTTP status',(await published).status(),200);
 await page.locator('.portal-success').waitFor();
 check('public API contains published section',(await api('/api/v1/public/site-pages/'+slug)).body.data.sections[0].heading,'DEMO saved introduction');
 const publicPage=await context.newPage();await publicPage.goto('http://localhost:3000/site/'+slug);
 check('public HTML renders published text',await publicPage.getByRole('heading',{name:'DEMO saved introduction',exact:true}).count(),1);
 await publicPage.close();
 check('unchanged revision cannot be published by editor',await page.getByRole('button',{name:'Publish page ↗',exact:true}).isDisabled(),true);
 let res=await api(root+'/publish','POST',{expectedRevision:draft.draftRevision});check('repeat publish gives conflict instead of false 503',res.status,409);check('repeat publish preserves database cause',res.body.error.code,'ALREADY_PUBLISHED');
 await page.locator('.studio-section-select').filter({hasText:'DEMO saved introduction'}).click();
 await page.getByLabel('Heading',{exact:true}).fill('DEMO revised introduction');
 check('unsaved form cannot publish',await page.getByRole('button',{name:'Publish page ↗',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'Save section changes',exact:true}).click();await page.locator('.portal-success').waitFor();
 check('published content unchanged while draft differs',(await api('/api/v1/public/site-pages/'+slug)).body.data.sections[0].heading,'DEMO saved introduction');
 draft=(await api(root)).body.data;
 res=await api(root+'/edit','PATCH',{expectedRevision:1,title:'DEMO stale edit'});check('optimistic revision conflict',res.status,409);check('revision conflict safe code',res.body.error.code,'REVISION_CONFLICT');
 res=await api(root+'/edit','PATCH',{expectedRevision:draft.draftRevision,title:'X'});check('invalid DTO rejected',res.status,400);
 const operationId=crypto.randomUUID(),payload={expectedRevision:draft.draftRevision,seoDescription:'DEMO duplicate-operation verification'};
 const duplicate=await Promise.all([api(root+'/edit','PATCH',payload,operationId),api(root+'/edit','PATCH',payload,operationId)]);
 check('duplicate operations both receive confirmed receipt',duplicate.map(x=>x.status),[200,200]);check('duplicate receipts agree',duplicate[0].body.data,duplicate[1].body.data);
 check('duplicate operation increments revision once',(await api(root)).body.data.draftRevision,draft.draftRevision+1);
 res=await api(root+'/edit','PATCH',{...payload,seoDescription:'DEMO changed payload'},operationId);check('reused key with changed payload conflicts',res.body.error.code,'IDEMPOTENCY_CONFLICT');
 const unauth=await browser.newContext();const anonymous=await unauth.request.get('http://localhost:3000/api/v1/teacher/website/pages');check('anonymous cannot read Teacher CMS',anonymous.status(),401);await unauth.close();
 await page.screenshot({path:resolve(dir,'cms-desktop.png'),fullPage:true});
 report.status='Pass';
}catch(e){report.status='Fail';report.failure=e.message;console.error(e.message);process.exitCode=1;}
finally{writeFileSync(resolve(dir,'cms-browser.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
