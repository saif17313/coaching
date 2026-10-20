import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href);
const browser=await chromium.connectOverCDP('http://127.0.0.1:9333'),context=browser.contexts()[0],page=context.pages()[0];
const original=JSON.parse(readFileSync('docs/evidence/2026-10-20/cms-browser.json','utf8'));
const {id,slug}=original.testPage,root='/api/v1/teacher/website/pages/'+id;
const report={time:new Date().toISOString(),project:original.project,testPage:original.testPage,checks:[]};
function check(name,actual,expected){assert.deepEqual(actual,expected,name);report.checks.push({name,status:'Pass'});console.log('PASS '+name);}
const api=(path,method='GET',body,operationId)=>page.evaluate(async({path,method,body,operationId})=>{const r=await fetch(path,{method,cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json','x-musa-ui':'1','Idempotency-Key':operationId??crypto.randomUUID()},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};},{path,method,body,operationId});
try{
 await page.reload();await page.getByRole('button',{name:'Website Admin',exact:true}).click();
 await page.locator('.studio-page-entry').filter({hasText:'/'+slug}).click();await page.locator('.studio-section-select').first().click();
 await page.getByRole('textbox',{name:'Homepage hero Heading',exact:true}).fill('DEMO typed browser save');
 const save=page.waitForResponse(r=>r.url().endsWith('/fields')&&r.request().method()==='PUT');
 await page.getByRole('button',{name:'Save structured fields',exact:true}).click();check('typed form saves through real Teacher gateway',(await save).status(),200);
 await page.locator('.portal-success').waitFor();let draft=(await api(root)).body.data;
 check('typed field independently read back',draft.sections[0].content.headline,'DEMO typed browser save');
 check('typed draft does not alter published snapshot',(await api('/api/v1/public/site-pages/'+slug)).body.data.sections[0].heading,'DEMO saved introduction');
 let result=await api(root+'/sections/'+draft.sections[0].id+'/fields','PUT',{sectionKey:'HOME_HERO',content:{headline:'DEMO',unexpected:'private'},itemId:null,expectedRevision:draft.draftRevision});check('typed unknown fields rejected by HTTP contract',result.status,400);
 const mediaId=crypto.randomUUID(),operation=crypto.randomUUID();report.mediaId=mediaId;
 const upload=()=>page.evaluate(async({mediaId,operation})=>{
  const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
  const r=await fetch('/api/v1/teacher/website/media/upload',{method:'POST',headers:{'Content-Type':'image/png','x-musa-ui':'1','Idempotency-Key':operation,'x-media-id':mediaId,'x-media-alt':'DEMO tiny image for storage security verification'},body:bytes});return {status:r.status,body:await r.json()};
 },{mediaId,operation});
 result=await upload();check('verified PNG uploads to private Supabase Storage',result.status,201);
 result=await upload();check('same image operation safely replays without overwrite',result.status,201);
 check('unpublished image absent from public media route',(await api('/api/v1/public/media/'+mediaId)).status,404);
 const itemId=crypto.randomUUID();report.itemId=itemId;report.sectionId=draft.sections[0].id;
 result=await api(root+'/sections/'+draft.sections[0].id+'/items/'+itemId,'PUT',{expectedRevision:draft.draftRevision,order:0,title:'DEMO test photograph',description:'Security verification image',url:null,visible:true});check('create media attachment item',result.status,200);draft=(await api(root)).body.data;
 result=await api(root+'/items/'+itemId+'/media','POST',{expectedRevision:draft.draftRevision,mediaId});check('attach verified image to draft',result.status,200);draft=(await api(root)).body.data;
 check('attached unpublished image remains private',(await api('/api/v1/public/media/'+mediaId)).status,404);
 result=await api(root+'/publish','POST',{expectedRevision:draft.draftRevision});check('publish typed fields and verified media atomically',result.status,200);
 const publicData=(await api('/api/v1/public/site-pages/'+slug)).body.data;
 check('public snapshot contains typed fields',publicData.sections[0].content.headline,'DEMO typed browser save');
 const publicMedia=await page.request.get('http://localhost:3000/api/v1/public/media/'+mediaId);check('published image delivered through public route',publicMedia.status(),200);check('public image MIME',publicMedia.headers()['content-type'],'image/png');
 const publicPage=await context.newPage();await publicPage.goto('http://localhost:3000/site/'+slug);
 check('typed headline rendered in public HTML',await publicPage.getByRole('heading',{name:'DEMO typed browser save',exact:true}).count(),1);
 mkdirSync('docs/evidence/2026-10-20',{recursive:true});await publicPage.screenshot({path:'docs/evidence/2026-10-20/typed-public-desktop.png',fullPage:true});await publicPage.close();
 result=await api('/api/v1/teacher/website/media/'+mediaId+'/archive','POST',{});check('published image cannot be archived',result.status,409);check('published-media conflict has a useful code',result.body.error.code,'MEDIA_PUBLIC_IN_USE');
 report.status='Pass';
}catch(e){report.status='Fail';report.failure=e.message;console.error(e.message);process.exitCode=1;}
finally{writeFileSync('docs/evidence/2026-10-20/cms-media-browser.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
