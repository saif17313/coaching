/** Private photo lifecycle on the explicitly approved DEV DEMO admission fixture. */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href),browser=await chromium.connectOverCDP('http://127.0.0.1:9333');
const id='e6b148e2-dfe4-4f3a-8b35-6046e2fa57de',root='/api/v1/teacher/students/'+id+'/admission';
const report={time:new Date().toISOString(),scope:'DEV DEMO private profile-photo attachment, read, removal and archival',checks:[]};
const check=(name,value,expected)=>{assert.deepEqual(value,expected,name);report.checks.push({name,status:'Pass'});console.log('PASS '+name);};
async function find(role){for(const page of browser.contexts().flatMap(context=>context.pages()))if(page.url().startsWith('http://localhost:3000')&&await page.evaluate(async role=>{const response=await fetch('/api/portal/auth/session');return response.ok&&(await response.json()).data?.role===role;},role))return page;throw Error(role+' session required');}
try{
 const teacher=await find('teacher'),student=await find('student');
 const form=teacher.getByRole('region',{name:'Student admission and full profile',exact:true});await form.getByRole('button',{name:'Reload profile',exact:true}).click();await form.getByRole('button',{name:'Save profile',exact:true}).waitFor();
 const before=await teacher.evaluate(async root=>(await(await fetch(root)).json()).data,root);if(before.personal.photoMediaId)throw Error('Existing profile photo must not be overwritten by this fixture.');
 const uploaded=teacher.waitForResponse(response=>response.url().endsWith('/api/v1/teacher/website/media/upload')&&response.request().method()==='POST');
 await form.getByLabel('Replace profile photograph',{exact:true}).setInputFiles({name:'DEMO-private-profile.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')});
 const upload=await uploaded;check('Teacher UI private photo upload',upload.status(),201);const media=(await upload.json()).data;report.mediaId=media.id;
 const publicStatus=await teacher.evaluate(async id=>(await fetch('/api/v1/public/media/'+id)).status,media.id);check('Uploaded profile photo stays unavailable publicly',publicStatus,404);
 check('Student has no access before profile assignment',await student.evaluate(async()=>(await fetch('/api/v1/student/profile-photo')).status),404);
 async function save(){const response=teacher.waitForResponse(response=>response.url().endsWith(root)&&response.request().method()==='PATCH');await form.getByRole('button',{name:'Save profile',exact:true}).click();check('Teacher profile photo assignment save',(await response).status(),200);await form.getByText('Profile saved and confirmed from the database.',{exact:true}).waitFor();}
 await save();
 const result=await student.evaluate(async()=>{const response=await fetch('/api/v1/student/profile-photo'),bytes=await response.arrayBuffer();return {status:response.status,cache:response.headers.get('cache-control'),type:response.headers.get('content-type'),size:bytes.byteLength,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(value=>value.toString(16).padStart(2,'0')).join('')};});
 check('Assigned Student reads private image through authenticated Storage',result.status,200);check('Private image content type',result.type,'image/png');check('Private image byte count',result.size,media.sizeBytes);assert.match(result.cache,/private, no-store/);
 const anonymous=await browser.newContext();check('Anonymous cannot read Student profile photo',(await anonymous.request.get('http://localhost:3000/api/v1/student/profile-photo')).status(),401);await anonymous.close();
 await form.getByRole('button',{name:'Remove assigned photo',exact:true}).click();await save();check('Removing assignment revokes Student image access',await student.evaluate(async()=>(await fetch('/api/v1/student/profile-photo')).status),404);
 const archived=await teacher.evaluate(async id=>{const response=await fetch('/api/v1/teacher/website/media/'+id+'/archive',{method:'POST',headers:{'Content-Type':'application/json','x-musa-ui':'1','Idempotency-Key':crypto.randomUUID()},body:'{}'});return response.status;},media.id);check('Unused DEMO image archived',archived,200);report.status='Pass';
}catch(error){report.status='Fail';report.failure=error.message;console.error(error.message);process.exitCode=1;}
finally{writeFileSync('docs/evidence/2026-10-21/student-photo-browser.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
