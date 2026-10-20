import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href);
const browser=await chromium.connectOverCDP('http://127.0.0.1:9333');let page;
for(const candidate of browser.contexts()[0].pages())if(await candidate.evaluate(async()=>{try{const r=await fetch('/api/portal/auth/session');return r.ok&&(await r.json()).data?.role==='teacher';}catch{return false;}})){page=candidate;break;}
if(!page)throw Error('Teacher sign-in required.');
const studentId=JSON.parse(readFileSync('docs/evidence/2026-10-20/student-invite.json')).body.data.studentId;
const batchId=JSON.parse(readFileSync('docs/evidence/2026-10-20/system-browser.json')).records.batchId;
const report={time:new Date().toISOString(),studentId,batchId,checks:[]};
const check=(name,actual,expected)=>{assert.deepEqual(actual,expected,name);report.checks.push({name,status:'Pass'});console.log('PASS '+name);};
try{
 await page.getByRole('button',{name:'Teacher Portal',exact:true}).click();await page.getByRole('button',{name:'Students',exact:true}).click();
 await page.evaluate(()=>{window.confirm=()=>true;});
 const row=page.locator('.teacher-ops-row').filter({hasText:'DEMO Audit Student'});
 const response=page.waitForResponse(r=>r.url().endsWith(`/students/${studentId}/status`)&&r.request().method()==='PATCH');await row.getByRole('button',{name:'Activate',exact:true}).click();check('Teacher activates confirmed DEMO Student through UI',(await response).status(),200);
 await page.getByRole('button',{name:'Enrollments',exact:true}).click();await page.getByRole('button',{name:'+ Enrollment request',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByRole('combobox').nth(0).selectOption(studentId);await dialog.getByRole('combobox').nth(1).selectOption(batchId);
 const enrolled=page.waitForResponse(r=>r.url().endsWith('/enrollment-requests')&&r.request().method()==='POST');await dialog.getByRole('button',{name:'Save changes',exact:true}).click();const r=await enrolled;check('Teacher requests DEMO enrollment through UI',r.status(),201);report.enrollmentId=(await r.json()).data.id;
 const enrollmentRow=page.locator('.teacher-ops-row').filter({hasText:studentId.slice(0,8)}).filter({hasText:batchId.slice(0,8)});
 const approved=page.waitForResponse(r=>r.url().endsWith(`/enrollments/${report.enrollmentId}/decision`)&&r.request().method()==='POST');await enrollmentRow.getByRole('button',{name:'Approve',exact:true}).click();check('Teacher approves DEMO enrollment through UI',(await approved).status(),200);
 report.status='Pass';
}catch(e){report.status='Fail';report.failure=e.message;console.error(e.message);process.exitCode=1;}
finally{writeFileSync('docs/evidence/2026-10-20/student-activation-browser.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
