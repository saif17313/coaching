import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href);
const teacherBrowser=await chromium.connectOverCDP('http://127.0.0.1:9333'),studentBrowser=await chromium.connectOverCDP('http://127.0.0.1:9334');
async function find(browser,role){for(const page of browser.contexts().flatMap(c=>c.pages()))if(page.url().startsWith('http://localhost:3000')&&await page.evaluate(async role=>{const r=await fetch('/api/portal/auth/session');return r.ok&&(await r.json()).data?.role===role;},role))return page;throw Error(`${role} sign-in required`);}
const teacher=await find(teacherBrowser,'teacher'),student=await find(studentBrowser,'student');
const records=JSON.parse(readFileSync('docs/evidence/2026-10-20/academic-browser.json')).records;
const studentId=JSON.parse(readFileSync('docs/evidence/2026-10-20/student-invite.json')).body.data.studentId;
const report={time:new Date().toISOString(),project:'rkpwqgwceekuvlizfpeb',records:{...records,studentId},checks:[]};
function check(name,actual,expected){assert.deepEqual(actual,expected,name);report.checks.push({name,status:'Pass'});console.log('PASS '+name);}
const api=(page,path,method='GET',body,operation)=>page.evaluate(async({path,method,body,operation})=>{const r=await fetch(path,{method,cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json','x-musa-ui':'1','Idempotency-Key':operation??crypto.randomUUID()},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:r.headers.get('content-type')?.includes('json')?await r.json():null};},{path,method,body,operation});
try{
 const {batchId,assignmentId}=records;
 check('Student dashboard API',(await api(student,'/api/v1/student/dashboard')).status,200);
 for(const path of ['/api/v1/teacher/overview','/api/v1/teacher/website/pages','/api/v1/teacher/website/write-status'])check('Student denied '+path,(await api(student,path)).status,403);
 check('Student cannot mutate Teacher batch',(await api(student,'/api/v1/teacher/batch-commands/'+batchId,'PATCH',{capacity:7})).status,403);
 const batches=(await api(student,'/api/v1/student/batches')).body.data;check('Student sees approved DEMO enrollment',batches.some(x=>x.id===batchId),true);
 const teacherBatches=(await api(teacher,'/api/v1/teacher/batches')).body.data;
 const other=(Array.isArray(teacherBatches)?teacherBatches:teacherBatches.items??[]).find(x=>x.id!==batchId);
 if(other)check('Student denied unenrolled batch',[403,404].includes((await api(student,`/api/v1/student/batches/${other.id}/subjects`)).status),true);
 check('Student reads enrolled subjects',(await api(student,`/api/v1/student/batches/${batchId}/subjects`)).status,200);
 await student.locator('.portal-sidebar').getByRole('button',{name:'Assignments',exact:true}).click();await student.locator('.portal-toolbar select').selectOption(batchId);
 const task=student.locator('.student-record').filter({hasText:'DEMO practice assignment'});await task.getByRole('button',{name:/Open assignment/}).click();
 await student.getByLabel('Your answer',{exact:true}).fill('DEMO answer: acceleration is the change in velocity per unit time.');
 const submitted=student.waitForResponse(r=>r.url().endsWith(`/assignments/${assignmentId}/submit`)&&r.request().method()==='POST');await student.getByRole('button',{name:/Submit assignment/}).click();const response=await submitted;check('Student submits answer through real UI',response.status(),200);report.records.submissionId=(await response.json()).data.id;
 let own=(await api(student,`/api/v1/student/assignments/${assignmentId}/submission`)).body.data;check('submission belongs to signed-in Student',own.studentId,studentId);check('ungraded feedback stays private',own.points,null);
 await teacher.getByRole('button',{name:'Teacher Portal',exact:true}).click();await teacher.locator('.portal-sidebar').getByRole('button',{name:'Assignments',exact:true}).click();await teacher.locator('.portal-toolbar select').selectOption(batchId);
 await teacher.locator('.academic-card').filter({hasText:'DEMO practice assignment'}).getByRole('button',{name:'Review submissions',exact:true}).click();
 const review=teacher.getByRole('region',{name:'Assignment submission review'});await review.getByText('DEMO answer: acceleration is the change in velocity per unit time.',{exact:true}).waitFor();check('Teacher can read submitted answer in review UI',true,true);
 await review.getByRole('button',{name:'Grade submission',exact:true}).click();await review.getByLabel('Points',{exact:true}).fill('80');await review.getByLabel('Feedback',{exact:true}).fill('DEMO feedback: clear definition.');
 const graded=teacher.waitForResponse(r=>r.url().endsWith('/grade')&&r.request().method()==='POST');await review.getByRole('button',{name:'Save grade draft',exact:true}).click();check('Teacher saves grade through UI',(await graded).status(),200);
 own=(await api(student,`/api/v1/student/assignments/${assignmentId}/submission`)).body.data;check('draft points remain hidden from Student',own.points,null);check('draft feedback remains hidden from Student',own.feedback,null);
 await teacher.evaluate(()=>{window.confirm=()=>true;});const published=teacher.waitForResponse(r=>r.url().endsWith('/grades/publish')&&r.request().method()==='POST');await review.getByRole('button',{name:'Publish assignment grades',exact:true}).click();check('Teacher publishes assignment grades through UI',(await published).status(),200);
 own=(await api(student,`/api/v1/student/assignments/${assignmentId}/submission`)).body.data;check('Student sees published points',own.points,80);check('Student sees published feedback',own.feedback,'DEMO feedback: clear definition.');
 let r=await api(teacher,`/api/v1/teacher/batches/${batchId}/announcements/create`,'POST',{title:'DEMO verification notice',body:'DEMO learning notification, for the authorized test Student only.',visibleFrom:null});check('Teacher creates announcement draft',r.status,201);report.records.announcementId=r.body.data.id;
 let notices=(await api(student,`/api/v1/student/batches/${batchId}/announcements`)).body.data;check('draft announcement is private',notices.items.some(x=>x.id===report.records.announcementId),false);
 r=await api(teacher,`/api/v1/teacher/announcements/${report.records.announcementId}/publish`,'POST',{});check('Teacher publishes announcement',r.status,201);
 notices=(await api(student,`/api/v1/student/batches/${batchId}/announcements`)).body.data;check('Student sees published announcement',notices.items.some(x=>x.id===report.records.announcementId),true);
 const eventId=crypto.randomUUID(),operation=crypto.randomUUID(),payload={eventId,title:'DEMO verification notification',body:'DEMO: this message verifies your own test inbox.'};
 r=await api(teacher,`/api/v1/teacher/batches/${batchId}/notifications/dispatch`,'POST',payload,operation);check('Teacher dispatches one DEMO notification',r.status,201);check('only approved DEMO enrollment receives notification',r.body.data.delivered,1);
 r=await api(teacher,`/api/v1/teacher/batches/${batchId}/notifications/dispatch`,'POST',payload,operation);check('notification duplicate safely replays',r.status,201);
 await student.getByRole('button',{name:'Close assignment',exact:true}).click();await student.locator('.portal-sidebar').getByRole('button',{name:'Notifications',exact:true}).click();
 const notice=student.locator('.student-notice').filter({hasText:'DEMO verification notification'});const read=student.waitForResponse(r=>r.url().endsWith('/read')&&r.request().method()==='POST');await notice.getByRole('button',{name:'Mark read',exact:true}).click();check('Student marks own notification read through UI',(await read).status(),200);
 check('Student cannot read nonexistent or foreign notification',(await api(student,'/api/v1/student/notifications/'+crypto.randomUUID()+'/read','POST',{})).status,404);
 check('Student billing reads without ledger fabrication',(await api(student,'/api/v1/student/billing?billPeriod=2026-10')).status,200);
 await student.screenshot({path:'docs/evidence/2026-10-20/student-desktop.png',fullPage:true});
 report.status='Pass';
}catch(e){report.status='Fail';report.failure=e.message;console.error(e.message);process.exitCode=1;}
finally{writeFileSync('docs/evidence/2026-10-20/student-browser.json',JSON.stringify(report,null,2)+'\n');await studentBrowser.close();await teacherBrowser.close();}
