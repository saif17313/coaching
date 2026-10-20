import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href);
const browser=await chromium.connectOverCDP('http://127.0.0.1:9333');
let page;for(const candidate of browser.contexts()[0].pages()){if(await candidate.evaluate(async()=>{try{const r=await fetch('/api/portal/auth/session');return r.ok&&(await r.json()).data?.role==='teacher';}catch{return false;}})){page=candidate;break;}}
if(!page)throw Error('Sign in as Teacher in the verification browser.');
const records=JSON.parse(readFileSync('docs/evidence/2026-10-20/academic-browser.json')).records;
const report={time:new Date().toISOString(),project:'rkpwqgwceekuvlizfpeb',records,checks:[]};
const api=(path,method='GET',body)=>page.evaluate(async({path,method,body})=>{const r=await fetch(path,{method,headers:method==='GET'?{}:{'Content-Type':'application/json','x-musa-ui':'1','Idempotency-Key':crypto.randomUUID()},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};},{path,method,body});
function check(name,actual,expected){assert.deepEqual(actual,expected,name);report.checks.push({name,status:'Pass'});console.log('PASS '+name);}
try{
 const {batchId,subjectId}=records;
 let r=await api(`/api/v1/teacher/batches/${batchId}/routine-slots`,'POST',{subjectId,dayOfWeek:2,startMinute:550,endMinute:590,room:'DEMO room'});check('overlapping routine returns business conflict',r.status,409);check('schedule conflict code',r.body.error.code,'SCHEDULE_CONFLICT');
 const releaseAt=new Date().toISOString(),dueAt=new Date(Date.now()+86400000).toISOString();
 if(!records.assignmentId){r=await api(`/api/v1/teacher/batches/${batchId}/assignment-drafts`,'POST',{subjectId,title:'DEMO practice assignment',instructions:'DEMO authorization test only.',releaseAt,dueAt,maxPoints:100,allowResubmit:true});check('Teacher creates assignment draft',r.status,201);records.assignmentId=r.body.data.id;}
 r=await api(`/api/v1/teacher/assignments/${records.assignmentId}/publish`,'POST');check('Teacher publishes assignment',r.status,200);
 r=await api(`/api/v1/teacher/batches/${batchId}/exam-drafts`,'POST',{subjectId,title:'DEMO assessment',scheduledAt:dueAt,maxMarks:100});check('Teacher creates exam draft',r.status,201);records.examId=r.body.data.id;
 r=await api(`/api/v1/teacher/exams/${records.examId}/publish`,'POST');check('Teacher publishes exam',r.status,200);
 check('Teacher denied Student dashboard',(await api('/api/v1/student/dashboard')).status,403);
 check('public revision manifest',(await api('/api/v1/public/site-revisions')).status,200);
 report.status='Pass';
}catch(error){report.status='Fail';report.failure=error.message;console.error(error.message);process.exitCode=1;}
finally{writeFileSync('docs/evidence/2026-10-20/academic-browser.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
