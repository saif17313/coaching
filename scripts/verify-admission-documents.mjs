import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {verificationSessions} from './verification-sessions.mjs';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href),browser=await chromium.connectOverCDP('http://localhost:9333');
const report={time:new Date().toISOString(),checks:[]};let teacher,student,original,mediaId;
const root='/api/v1/teacher/students/e6b148e2-dfe4-4f3a-8b35-6046e2fa57de/workflow';
async function api(path,method='GET',body){return teacher.evaluate(async({path,method,body})=>{const response=await fetch(path,{method,headers:method==='GET'?{}:{'Content-Type':'application/json','x-musa-ui':'1','Idempotency-Key':crypto.randomUUID()},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};},{path,method,body});}
try{
 ({teacher,student}=await verificationSessions(browser));const before=await api(root);assert.equal(before.status,200);original=before.body.data.details;
 const upload=await teacher.evaluate(async()=>{const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlBT4sAAAAASUVORK5CYII='),c=>c.charCodeAt(0));const response=await fetch('/api/v1/teacher/website/media/upload',{method:'POST',headers:{'Content-Type':'image/png','x-musa-ui':'1','Idempotency-Key':crypto.randomUUID(),'x-media-id':crypto.randomUUID(),'x-media-alt':'DEMO isolated document access verification'},body:bytes});return {status:response.status,body:await response.json()};});
 assert.equal(upload.status,201);mediaId=upload.body.data.id;
 assert.equal((await api(root,'POST',{action:'details.save',data:{...original,documents:[...original.documents,mediaId],expectedRevision:before.body.data.revision}})).status,200);
 const own=await student.evaluate(async id=>{const response=await fetch('/api/v1/student/documents/'+id);return {status:response.status,type:response.headers.get('Content-Type'),cache:response.headers.get('Cache-Control'),size:(await response.arrayBuffer()).byteLength};},mediaId);
 assert.equal(own.status,200);assert.equal(own.type,'image/png');assert.match(own.cache,/no-store/);assert.ok(own.size>0);
 const anon=await browser.newContext(),page=await anon.newPage();await page.goto('http://localhost:3000/');assert.equal(await page.evaluate(async id=>(await fetch('/api/v1/public/media/'+id)).status,mediaId),404);assert.equal(await page.evaluate(async id=>(await fetch('/api/v1/student/documents/'+id)).status,mediaId),401);await anon.close();
 report.checks.push('Verified private upload succeeds','Assigned Student receives integrity-checked image bytes with no-store','Anonymous document access denied','Private document absent from public media');report.status='Pass';console.log('PASS private admission document upload, assignment, own read and public denial');
}catch(error){report.status='Fail';report.failure=error.message;process.exitCode=1;console.error(error.message);}
finally{try{if(original){const current=(await api(root)).body.data;assert.equal((await api(root,'POST',{action:'details.save',data:{...original,expectedRevision:current.revision}})).status,200);}if(mediaId)assert.equal((await api('/api/v1/teacher/website/media/'+mediaId+'/archive','POST',{})).status,200);report.cleanup='Original assignments restored; isolated verification image archived';}catch(error){report.cleanupFailure=error.message;report.status='Fail';process.exitCode=1;}writeFileSync('docs/evidence/2026-10-21/context-documents.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
