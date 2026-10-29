import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href);
const tb=await chromium.connectOverCDP('http://127.0.0.1:9333'),sb=await chromium.connectOverCDP('http://127.0.0.1:9334');
async function find(b,role){for(const p of b.contexts().flatMap(c=>c.pages()))if(p.url().startsWith('http://localhost:3000')&&await p.evaluate(async role=>{const r=await fetch('/api/portal/auth/session');return r.ok&&(await r.json()).data?.role===role;},role))return p;throw Error(role+' session required');}
const teacher=await find(tb,'teacher'),student=await find(sb,'student'),{batchId,subjectId}=JSON.parse(readFileSync('docs/evidence/2026-10-20/academic-browser.json')).records;
const studentId=JSON.parse(readFileSync('docs/evidence/2026-10-20/student-invite.json')).body.data.studentId,report={time:new Date().toISOString(),records:{batchId,subjectId,studentId},checks:[]};
const api=(page,path,method='GET',body)=>page.evaluate(async({path,method,body})=>{const r=await fetch(path,{method,headers:method==='GET'?{}:{'Content-Type':'application/json','x-musa-ui':'1','Idempotency-Key':crypto.randomUUID()},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};},{path,method,body});
const check=(name,actual,expected)=>{assert.deepEqual(actual,expected,name);report.checks.push({name,status:'Pass'});console.log('PASS '+name);};
try{
 let r=await api(teacher,`/api/v1/teacher/batches/${batchId}/exam-drafts`,'POST',{subjectId,title:'DEMO completed assessment - verification only',scheduledAt:new Date(Date.now()-86400000).toISOString(),maxMarks:100});check('Teacher creates isolated completed DEMO exam',r.status,201);const examId=r.body.data.id;report.records.examId=examId;
 r=await api(teacher,`/api/v1/teacher/exams/${examId}/publish`,'POST');check('Teacher publishes DEMO exam',r.status,200);
 await teacher.getByRole('button',{name:'Teacher Portal',exact:true}).click();await teacher.locator('.portal-sidebar').getByRole('button',{name:'Results',exact:true}).click();await teacher.locator('.portal-toolbar select').selectOption(batchId);await teacher.getByLabel(/^Choose exam/).selectOption(examId);
 await teacher.getByRole('button',{name:'+ Save result draft',exact:true}).click();const dialog=teacher.locator('.portal-screen-slot>.portal-screen').last();await dialog.getByRole('combobox').selectOption(studentId);await dialog.getByLabel('Marks',{exact:true}).fill('75');
 const saved=teacher.waitForResponse(r=>r.url().endsWith('/results/draft')&&r.request().method()==='POST');await dialog.getByRole('button',{name:/Save securely/}).click();check('Teacher saves DEMO marks through UI',(await saved).status(),201);
 check('draft exam result absent from Student results',(await api(student,'/api/v1/student/results')).body.data.items.some(x=>x.examId===examId),false);
 await teacher.evaluate(()=>{window.confirm=()=>true;});const published=teacher.waitForResponse(r=>r.url().endsWith('/results/publish')&&r.request().method()==='POST');await teacher.getByRole('button',{name:/Publish exam results/}).click();check('Teacher publishes exam results through UI',(await published).status(),200);
 const own=(await api(student,'/api/v1/student/results')).body.data.items.find(x=>x.examId===examId);check('Student sees own published score',own.marks,75);check('single DEMO Student rank',own.rank,1);
 await student.locator('.portal-sidebar').getByRole('button',{name:'Results',exact:true}).click();await student.locator('.student-result').filter({hasText:'DEMO completed assessment - verification only'}).waitFor();check('Student results UI displays persisted published score',true,true);
 report.status='Pass';
}catch(e){report.status='Fail';report.failure=e.message;console.error(e.message);process.exitCode=1;}
finally{writeFileSync('docs/evidence/2026-10-20/exam-results-browser.json',JSON.stringify(report,null,2)+'\n');await tb.close();await sb.close();}
