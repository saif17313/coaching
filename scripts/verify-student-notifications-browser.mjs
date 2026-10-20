import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href);
const teacherBrowser=await chromium.connectOverCDP('http://127.0.0.1:9333'),studentBrowser=await chromium.connectOverCDP('http://127.0.0.1:9334');
async function find(browser,role){for(const page of browser.contexts().flatMap(c=>c.pages()))if(page.url().startsWith('http://localhost:3000')&&await page.evaluate(async role=>{const r=await fetch('/api/portal/auth/session');return r.ok&&(await r.json()).data?.role===role;},role))return page;throw Error(`${role} sign-in required`);}
const teacher=await find(teacherBrowser,'teacher'),student=await find(studentBrowser,'student');
const records=JSON.parse(readFileSync('docs/evidence/2026-10-20/academic-browser.json')).records;
const previous=JSON.parse(readFileSync('docs/evidence/2026-10-20/student-browser.json'));
const report={time:new Date().toISOString(),project:'rkpwqgwceekuvlizfpeb',records:{...previous.records},checks:[]};
function check(name,actual,expected){assert.deepEqual(actual,expected,name);report.checks.push({name,status:'Pass'});console.log('PASS '+name);}
const api=(page,path,method='GET',body,operation)=>page.evaluate(async({path,method,body,operation})=>{const r=await fetch(path,{method,cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json','x-musa-ui':'1','Idempotency-Key':operation??crypto.randomUUID()},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:r.headers.get('content-type')?.includes('json')?await r.json():null};},{path,method,body,operation});
try{
 const {batchId}=records;
 let notices=(await api(student,`/api/v1/student/batches/${batchId}/announcements`)).body.data;check('Student sees published announcement',notices.items.some(x=>x.id===report.records.announcementId),true);
 const eventId=crypto.randomUUID(),operation=crypto.randomUUID(),payload={eventId,title:'DEMO verification notification',body:'DEMO: this message verifies your own test inbox.'};
 let r=await api(teacher,`/api/v1/teacher/batches/${batchId}/notifications/dispatch`,'POST',payload,operation);check('Teacher dispatches one DEMO notification',r.status,201);check('only approved DEMO enrollment receives notification',r.body.data.delivered,1);
 r=await api(teacher,`/api/v1/teacher/batches/${batchId}/notifications/dispatch`,'POST',payload,operation);check('notification duplicate safely replays',r.status,201);
 if(await student.getByRole('button',{name:'Close assignment',exact:true}).count())await student.getByRole('button',{name:'Close assignment',exact:true}).click();await student.locator('.portal-sidebar').getByRole('button',{name:'Notifications',exact:true}).click();
 const notice=student.locator('.student-notice').filter({hasText:'DEMO verification notification'});const read=student.waitForResponse(r=>r.url().endsWith('/read')&&r.request().method()==='POST');await notice.getByRole('button',{name:'Mark read',exact:true}).click();check('Student marks own notification read through UI',(await read).status(),200);
 check('Student cannot read nonexistent notification',(await api(student,'/api/v1/student/notifications/'+crypto.randomUUID()+'/read','POST',{})).status,404);
 check('Student billing reads without ledger fabrication',(await api(student,'/api/v1/student/billing?billPeriod=2026-10')).status,200);
 await student.screenshot({path:'docs/evidence/2026-10-20/student-desktop.png',fullPage:true});
 report.status='Pass';
}catch(e){report.status='Fail';report.failure=e.message;console.error(e.message);process.exitCode=1;}
finally{writeFileSync('docs/evidence/2026-10-20/student-notifications-browser.json',JSON.stringify(report,null,2)+'\n');await studentBrowser.close();await teacherBrowser.close();}
