import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href);
const browser=await chromium.connectOverCDP('http://127.0.0.1:9333'),context=browser.contexts()[0],page=context.pages()[0];
const media=JSON.parse(readFileSync('docs/evidence/2026-10-20/cms-media-browser.json','utf8'));
const root='/api/v1/teacher/website/pages/'+media.testPage.id;
const report={project:'rkpwqgwceekuvlizfpeb',time:new Date().toISOString(),checks:[],records:{cmsPageId:media.testPage.id,mediaId:media.mediaId}};
function check(name,actual,expected){assert.deepEqual(actual,expected,name);report.checks.push({name,status:'Pass'});console.log('PASS '+name);}
const api=(path,method='GET',body,operationId)=>page.evaluate(async({path,method,body,operationId})=>{const r=await fetch(path,{method,cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json','x-musa-ui':'1','Idempotency-Key':operationId??crypto.randomUUID()},...(body===undefined?{}:{body:JSON.stringify(body)})});const isJson=r.headers.get('content-type')?.includes('json');return {status:r.status,body:isJson?await r.json():null,size:isJson?null:(await r.arrayBuffer()).byteLength,contentType:r.headers.get('content-type')};},{path,method,body,operationId});
try{
 let response=await api('/api/v1/public/media/'+media.mediaId);check('public image delivery after policy repair',response.status,200);check('verified public image bytes',response.size,68);
 const publicView=await context.newPage();await publicView.goto('http://localhost:3000/site/'+media.testPage.slug);
 check('typed saved headline appears in public HTML',await publicView.getByRole('heading',{name:'DEMO typed browser save',exact:true}).count(),1);
 await publicView.screenshot({path:'docs/evidence/2026-10-20/typed-public-desktop.png',fullPage:true});await publicView.close();
 let draft=(await api(root)).body.data;
 const second=crypto.randomUUID();response=await api(root+'/sections/'+second,'PUT',{expectedRevision:draft.draftRevision,kind:'rich-text',order:10,heading:'DEMO ordering check',body:'DEMO isolated section',visible:true});check('create independent draft section',response.status,200);
 draft=(await api(root)).body.data;const order=draft.sections.slice().sort((a,b)=>b.order-a.order).map(s=>s.id);
 response=await api(root+'/organize','POST',{action:'sections.reorder',sectionId:null,itemId:null,orderIds:order,expectedRevision:draft.draftRevision});check('atomic section reorder',response.status,200);
 draft=(await api(root)).body.data;check('section order read-back',draft.sections.map(s=>s.id),order);
 check('ordering draft not exposed before publish',(await api('/api/v1/public/site-pages/'+media.testPage.slug)).body.data.sections.length,1);
 response=await api(root+'/organize','POST',{action:'sections.reorder',sectionId:null,itemId:null,orderIds:[second,second],expectedRevision:draft.draftRevision});check('duplicate ordering IDs rejected',response.status,400);
 response=await api(root+'/organize','POST',{action:'media.detach',sectionId:null,itemId:media.itemId,orderIds:null,expectedRevision:draft.draftRevision});check('image detached from draft',response.status,200);draft=(await api(root)).body.data;
 check('published image remains available before removal is published',(await api('/api/v1/public/media/'+media.mediaId)).status,200);
 response=await api('/api/v1/teacher/website/media/'+media.mediaId+'/archive','POST',{});check('archive still blocked while old snapshot uses image',response.status,409);
 response=await api(root+'/publish','POST',{expectedRevision:draft.draftRevision});check('publish image removal and new ordering',response.status,200);
 check('public image access revoked after removal publication',(await api('/api/v1/public/media/'+media.mediaId)).status,404);
 response=await api('/api/v1/teacher/website/media/'+media.mediaId+'/archive','POST',{});check('unreferenced image archives through Teacher RPC',response.status,200);
 const stamp=Date.now().toString(36).toUpperCase();
 response=await api('/api/v1/teacher/batch-commands','POST',{code:'DEMO_'+stamp,name:'DEMO system audit '+stamp,capacity:5});check('Teacher creates a DEMO batch',response.status,201);const batchId=response.body.data.id;report.records.batchId=batchId;
 response=await api('/api/v1/teacher/batch-commands/'+batchId,'PATCH',{name:'DEMO system audit reviewed',capacity:6});check('Teacher updates DEMO batch',response.status,200);
 check('batch read-back returns persisted edit',JSON.stringify((await api('/api/v1/teacher/batches/'+batchId)).body.data).includes('DEMO system audit reviewed'),true);
 response=await api('/api/v1/teacher/batches/'+batchId+'/subjects/create','POST',{code:'DEMO_PHYS',title:'DEMO Physics'});check('Teacher creates batch subject',response.status,201);const subjectId=response.body.data.id;report.records.subjectId=subjectId;
 response=await api('/api/v1/teacher/subjects/'+subjectId+'/syllabus/add','POST',{title:'DEMO Mechanics',position:1});check('Teacher creates syllabus unit',response.status,201);
 response=await api('/api/v1/teacher/batches/'+batchId+'/routine-slots','POST',{subjectId,dayOfWeek:2,startMinute:540,endMinute:600,room:'DEMO room'});check('Teacher creates routine slot',response.status,201);
 response=await api('/api/v1/teacher/batches/'+batchId+'/routine-slots','POST',{subjectId,dayOfWeek:2,startMinute:550,endMinute:590,room:'DEMO room'});check('overlapping routine is a business conflict',response.status,409);
 const releaseAt=new Date(Date.now()+3600000).toISOString(),dueAt=new Date(Date.now()+86400000).toISOString();
 response=await api('/api/v1/teacher/batches/'+batchId+'/assignment-drafts','POST',{subjectId,title:'DEMO practice assignment',instructions:'DEMO answer for authorization testing only.',releaseAt,dueAt,maxPoints:100,allowResubmit:true});check('Teacher creates assignment draft',response.status,201);report.records.assignmentId=response.body.data.id;
 response=await api('/api/v1/teacher/assignments/'+report.records.assignmentId+'/publish','POST',{});check('Teacher publishes assignment to isolated batch',response.status,200);
 response=await api('/api/v1/teacher/batches/'+batchId+'/exam-drafts','POST',{subjectId,title:'DEMO assessment',scheduledAt:dueAt,maxMarks:100});check('Teacher creates exam draft',response.status,201);report.records.examId=response.body.data.id;
 response=await api('/api/v1/teacher/exams/'+report.records.examId+'/publish','POST',{});check('Teacher publishes isolated exam',response.status,200);
 check('Teacher cannot access Student dashboard',(await api('/api/v1/student/dashboard')).status,403);
 check('public revision manifest is available',(await api('/api/v1/public/site-revisions')).status,200);
 response=await api('/api/v1/teacher/batch-commands/'+batchId,'PATCH',{isArchived:true});check('DEMO batch safely archived after verification',response.status,200);
 report.status='Pass';
}catch(e){report.status='Fail';report.failure=e.message;console.error(e.message);process.exitCode=1;}
finally{writeFileSync('docs/evidence/2026-10-20/system-browser.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
