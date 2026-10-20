/** Approved DEV DEMO admission only; no account, enrollment or financial writes. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href);
const browser=await chromium.connectOverCDP('http://127.0.0.1:9333');
const id='e6b148e2-dfe4-4f3a-8b35-6046e2fa57de',root='/api/v1/teacher/students/'+id+'/admission';
const report={time:new Date().toISOString(),project:'rkpwqgwceekuvlizfpeb',scope:'Explicitly approved existing DEV DEMO Student admission; no account/enrollment/ledger changes',checks:[]};
const directory='docs/evidence/2026-10-21';mkdirSync(directory,{recursive:true});
function check(name,actual,expected){assert.deepEqual(actual,expected,name);report.checks.push({name,status:'Pass'});console.log('PASS '+name);}
async function find(role){for(const page of browser.contexts().flatMap(context=>context.pages()))if(page.url().startsWith('http://localhost:3000')&&await page.evaluate(async role=>{const response=await fetch('/api/portal/auth/session');return response.ok&&(await response.json()).data?.role===role;},role))return page;throw Error(role+' authenticated session required');}
const api=(page,path,body)=>page.evaluate(async({path,body})=>{const response=await fetch(path,{method:body?'PATCH':'GET',cache:'no-store',...(body?{headers:{'Content-Type':'application/json','x-musa-ui':'1','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};},{path,body});
try{
 const teacher=await find('teacher'),student=await find('student');
 let initial=await api(teacher,root);check('Teacher reads existing Student admission DTO',initial.status,200);check('Exact approved DEMO account',initial.body.data.email,'effytech10@gmail.com');
 if(initial.body.data.revision!==0&&!(initial.body.data.revision===1&&initial.body.data.guardian.fullName==='DEMO Admission Guardian'))throw Error('Unexpected fixture revision; inspect evidence before rerunning.');
 const create=initial.body.data.revision===0;
 await teacher.getByRole('button',{name:'Students',exact:true}).click();
 const row=teacher.locator('.teacher-ops-row').filter({hasText:id.slice(0,8)});await row.getByRole('button',{name:'Admission & full profile',exact:true}).click();
 const form=teacher.getByRole('region',{name:'Student admission and full profile',exact:true});
 if(create){await form.getByLabel('Guardian name',{exact:true}).fill('DEMO Admission Guardian');
 await form.getByLabel('Relationship',{exact:true}).fill('DEMO guardian');
 await form.getByLabel('Guardian mobile',{exact:true}).fill('00000000000');
 await form.getByLabel('Alternate / emergency contact',{exact:true}).fill('DEMO private emergency contact');
 await form.getByLabel('School / college',{exact:true}).fill('DEMO Admission School');
 await form.getByLabel('Class',{exact:true}).fill('DEMO class');
 await form.getByLabel('Present address',{exact:true}).fill('DEMO admission address');
 await teacher.evaluate(()=>{window.confirm=()=>true;});
 const saved=teacher.waitForResponse(response=>response.url().endsWith(root)&&response.request().method()==='PATCH');
 await form.getByRole('button',{name:'Create admission & roll',exact:true}).click();check('Teacher UI saves admission', (await saved).status(),200);
 await form.getByText('Profile saved and confirmed from the database.',{exact:true}).waitFor();}
 initial=await api(teacher,root);check('Saved admission revision',initial.body.data.revision,1);assert.match(initial.body.data.admissionRoll,/^EC-\d{4}-\d{8}$/);report.admissionRoll=initial.body.data.admissionRoll;
 check('Guardian persists independently',initial.body.data.guardian.fullName,'DEMO Admission Guardian');
 await form.getByRole('button',{name:'Reload profile',exact:true}).click();await form.getByRole('button',{name:'Save profile',exact:true}).waitFor();check('Teacher reload retrieves academic details',await form.getByLabel('School / college',{exact:true}).inputValue(),'DEMO Admission School');
 let self=await api(student,'/api/v1/student/admission-profile');check('Student reads the same admission roll',self.body.data.admissionRoll,report.admissionRoll);check('Emergency contact redacted for Student',Object.hasOwn(self.body.data.guardian,'emergencyContact'),false);
 check('Student cannot use Teacher admission endpoint',(await api(student,root)).status,403);
 check('Student cannot change guardian through self-service',(await api(student,'/api/v1/student/admission-profile',{data:{guardianName:'FORBIDDEN'},expectedRevision:1})).status,400);
 await student.getByRole('button',{name:'My profile',exact:true}).click();
 const own=student.getByRole('region',{name:'Your admission and profile',exact:true});await own.getByLabel('Student phone',{exact:true}).fill('00000000001');
 check('Student guardian fields are read-only',await own.getByLabel('Guardian name',{exact:true}).getAttribute('readonly'),'');
 check('Student emergency contact absent from UI',await own.getByLabel('Alternate / emergency contact',{exact:true}).count(),0);
 const selfSaved=student.waitForResponse(response=>response.url().endsWith('/api/v1/student/admission-profile')&&response.request().method()==='PATCH');
 await own.getByRole('button',{name:'Save profile',exact:true}).click();check('Student permitted UI self-edit',(await selfSaved).status(),200);await own.getByText('Profile saved and confirmed from the database.',{exact:true}).waitFor();
 const confirmed=await api(teacher,root);check('Teacher sees Student phone update',confirmed.body.data.personal.phone,'00000000001');check('Shared revision increments',confirmed.body.data.revision,2);check('Guardian administrative data preserved',confirmed.body.data.guardian.emergencyContact,'DEMO private emergency contact');
 await teacher.screenshot({path:directory+'/admission-teacher.png',fullPage:true});await student.screenshot({path:directory+'/admission-student.png',fullPage:true});
 report.status='Pass';
}catch(error){report.status='Fail';report.failure=error.message;console.error(error.message);process.exitCode=1;}
finally{writeFileSync(directory+'/student-admission-browser.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
