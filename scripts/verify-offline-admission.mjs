/**
 * Production/local browser verification of offline admission (no email/password/Auth).
 * Credentials come only from EDUCENTRE_TEACHER_EMAIL / EDUCENTRE_STUDENT_EMAIL / EDUCENTRE_TEST_PASSWORD.
 * Creates one clearly labelled offline test Student and one test batch; records NO payments, so
 * genuine finance totals are untouched. Usage: node scripts/verify-offline-admission.mjs <playwright-module> [origin]
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const [moduleUrl,origin='https://educentre-iota.vercel.app']=process.argv.slice(2);
if(!['http://localhost:3000','https://educentre-iota.vercel.app'].includes(origin))throw Error('Unreviewed origin.');
const {chromium}=await import(pathToFileURL(moduleUrl).href);
const env=k=>{const v=process.env[k];if(!v)throw Error(k+' is required');return v;};
const stamp=new Date().toISOString().replace(/\D/g,'').slice(0,12),name='E2E Offline Test Student '+stamp;
const report={time:new Date().toISOString(),origin,scope:'Offline admission test Student and test batch only; no payments recorded',checks:[]};
const dir='docs/evidence/2026-10-27';mkdirSync(dir,{recursive:true});
const check=(label,actual,expected)=>{assert.deepEqual(actual,expected,label);report.checks.push({label,status:'Pass',actual});console.log('PASS',label);};
const browser=await chromium.launch();
async function login(role){
 const page=await (await browser.newContext({viewport:{width:1440,height:900}})).newPage();
 await page.goto(origin+'/portal',{waitUntil:'domcontentloaded'});
 await page.getByLabel('Email address',{exact:true}).fill(env(role==='teacher'?'EDUCENTRE_TEACHER_EMAIL':'EDUCENTRE_STUDENT_EMAIL'));
 await page.getByLabel('Password',{exact:true}).fill(env('EDUCENTRE_TEST_PASSWORD'));
 const res=page.waitForResponse(r=>r.url().endsWith('/api/portal/auth/login')&&r.request().method()==='POST');
 await page.getByRole('button',{name:/^Sign in securely/}).click();
 const body=await (await res).json();assert.equal(body.data?.role,role,'role for '+role);return page;
}
const api=(page,path,method='GET',body)=>page.evaluate(async({path,method,body})=>{const r=await fetch(path,{method,cache:'no-store',headers:body?{'Content-Type':'application/json','x-musa-ui':'1','Idempotency-Key':crypto.randomUUID()}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json().catch(()=>null)};},{path,method,body});
let teacher;
try{
 teacher=await login('teacher');const student=await login('student');
 // A. Offline admission through the real form: no email or password field is required.
 await teacher.getByRole('complementary').getByRole('button',{name:'Students',exact:true}).click();
 await teacher.getByRole('button',{name:'Registered records',exact:true}).click();
 await teacher.getByRole('button',{name:'Add student',exact:true}).click();
 const modal=teacher.getByRole('dialog');
 check('Add student form has no Student email or password field',[await modal.getByLabel('Student email').count(),await modal.locator('input[type=password]').count()],[0,0]);
 await modal.getByLabel('Student name',{exact:true}).fill(name);
 await modal.getByLabel('New Student Student phone').fill('01700000000');
 await modal.getByLabel('New Student School / college').fill('E2E Test College');
 await modal.getByLabel('New Student Class').fill('HSC 1st Year');
 await modal.getByLabel('New Student Guardian name').fill('E2E Test Guardian');
 await modal.getByLabel('New Student Relationship').fill('Father');
 await modal.getByLabel('New Student Guardian mobile').fill('01800000000');
 const created=teacher.waitForResponse(r=>r.url().endsWith('/api/v1/teacher/students/offline')&&r.request().method()==='POST');
 const admitted=teacher.waitForResponse(r=>/\/students\/[0-9a-f-]{36}\/admission$/.test(r.url())&&r.request().method()==='PATCH');
 await modal.getByRole('button',{name:'Admit student',exact:true}).click();
 const createdRes=await created;check('Offline create returns 201',createdRes.status(),201);
 const studentId=(await createdRes.json()).data.studentId;report.studentId=studentId;
 check('Admission details saved',(await admitted).status(),200);
 const profile=teacher.getByRole('region',{name:'Student admission and full profile',exact:true});
 await profile.getByText('No portal login (offline record)').waitFor({timeout:20000});check('Profile shows no portal login','none','none');
 // Photograph upload through the profile avatar control.
 const uploaded=teacher.waitForResponse(r=>r.url().endsWith('/api/v1/teacher/website/media/upload')&&r.request().method()==='POST',{timeout:60000});
 await profile.locator('.student-avatar-edit-badge input[type=file]').setInputFiles('public/brand/icon-512.png');
 check('Photograph upload accepted',(await uploaded).ok(),true);
 const photoSaved=teacher.waitForResponse(r=>/\/students\/[0-9a-f-]{36}\/admission$/.test(r.url())&&r.request().method()==='PATCH');
 await profile.getByRole('button',{name:'Save profile',exact:true}).click();
 check('Profile saved with photograph',(await photoSaved).status(),200);
 // Reload and read back from the server.
 await teacher.reload({waitUntil:'domcontentloaded'});
 let read=await api(teacher,`/api/v1/teacher/students/${studentId}/admission`);
 check('Persisted after reload: name',read.body.data.fullName,name);
 check('Persisted after reload: no email',read.body.data.email,'');
 check('Persisted after reload: phone/class/guardian',[read.body.data.personal.phone,read.body.data.personal.className,read.body.data.guardian.fullName],['01700000000','HSC 1st Year','E2E Test Guardian']);
 check('Admission roll issued',/^EC-\d{4}-\d{8,}$/.test(read.body.data.admissionRoll),true);
 check('Photograph linked',typeof read.body.data.personal.photoMediaId,'string');
 check('Account active without Auth',read.body.data.accountStatus,'active');
 const loginState=await api(teacher,`/api/v1/teacher/students/${studentId}/login`);check('Login state none',loginState.body.data.state,'none');
 // B. Batch enrollment without Auth.
 const batch=await api(teacher,'/api/v1/teacher/batch-commands','POST',{code:'E2E-OFF-'+stamp.slice(-6),name:'E2E Offline Test Batch '+stamp,capacity:5});
 check('Test batch created',batch.status<300,true);const batchId=batch.body.data.id;report.batchId=batchId;
 const request=await api(teacher,'/api/v1/teacher/enrollment-requests','POST',{studentId,batchId});check('Enrollment requested',request.status<300,true);
 const decision=await api(teacher,`/api/v1/teacher/enrollments/${request.body.data.id}/decision`,'POST',{decision:'approve'});check('Enrollment approved',decision.status<300,true);
 read=await api(teacher,`/api/v1/teacher/students/${studentId}/admission`);
 check('Enrollment visible on profile',read.body.data.enrollments.map(e=>[e.batchId,e.status]),[[batchId,'active']]);
 const duplicate=await api(teacher,'/api/v1/teacher/enrollment-requests','POST',{studentId,batchId});check('Duplicate enrollment rejected',duplicate.status>=400,true);
 // D (pre-linking safety). Registered email cannot be linked to this Student.
 const taken=await api(teacher,`/api/v1/teacher/students/${studentId}/login`,'POST',{email:env('EDUCENTRE_STUDENT_EMAIL')});
 check('Linking an already registered email is rejected',[taken.status,taken.body?.error?.code],[409,'EMAIL_ALREADY_REGISTERED']);
 // F. Security boundaries.
 check('Student cannot create offline students',(await api(student,'/api/v1/teacher/students/offline','POST',{fullName:'Intruder Student'})).status,403);
 check('Student cannot read another Student',(await api(student,`/api/v1/teacher/students/${studentId}/admission`)).status>=401,true);
 check('Student cannot activate logins',(await api(student,`/api/v1/teacher/students/${studentId}/login`,'POST',{email:'x@example.invalid'})).status,403);
 const anon=await (await browser.newContext()).newPage();await anon.goto(origin+'/portal',{waitUntil:'domcontentloaded'});
 check('Anonymous offline create denied',(await api(anon,'/api/v1/teacher/students/offline','POST',{fullName:'Anon Student'})).status,401);
 check('Existing registered Student still reads own profile',(await api(student,'/api/v1/student/admission-profile')).status,200);
 await teacher.screenshot({path:`${dir}/offline-admission-teacher.png`,fullPage:false});
 report.status='Pass';
}catch(e){report.status='Fail';report.failure=e.message;process.exitCode=1;console.error('FAIL',e.message);if(teacher)await teacher.screenshot({path:`${dir}/offline-admission-failure.png`}).catch(()=>{});}
finally{writeFileSync(`${dir}/offline-admission.json`,JSON.stringify(report,null,1));await browser.close();}
