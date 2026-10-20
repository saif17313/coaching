import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {verificationSessions} from './verification-sessions.mjs';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href),browser=await chromium.connectOverCDP('http://127.0.0.1:9333');
const directory='docs/evidence/2026-10-21/premium';mkdirSync(directory,{recursive:true});const report={time:new Date().toISOString(),checks:[]};
const check=(name,value,expected)=>{assert.deepEqual(value,expected,name);report.checks.push({name,status:'Pass'});console.log('PASS '+name);};
try{
 const {teacher,student}=await verificationSessions(browser);await teacher.setViewportSize({width:1440,height:1080});
 await teacher.goto('http://localhost:3000/portal');await teacher.locator('.portal-nav-scroll').getByRole('button',{name:'Students',exact:true}).click();await teacher.getByRole('heading',{name:'Student directory',exact:true}).waitFor();
 const api=await teacher.evaluate(async()=>{const response=await fetch('/api/v1/teacher/students/directory?limit=20&offset=0');return {status:response.status,body:await response.json()};});check('Complete Teacher directory API',api.status,200);
 const row=api.body.data.students.find(row=>row.id==='e6b148e2-dfe4-4f3a-8b35-6046e2fa57de');assert.ok(row,'Existing approved DEMO Student is present');
 const profile=await teacher.evaluate(async id=>(await(await fetch('/api/v1/teacher/students/'+id+'/admission')).json()).data,row.id);
 check('Directory guardian comes from persisted profile',row.guardianName,profile.guardian.fullName);check('Directory school comes from persisted profile',row.schoolName,profile.personal.schoolName);check('Directory phone comes from persisted profile',row.phone,profile.personal.phone);check('Directory admission roll comes from persisted profile',row.admissionRoll,profile.admissionRoll);
 const record=teacher.locator('.premium-table tbody tr').filter({hasText:row.admissionRoll});await record.waitFor();for(const value of [row.fullName,row.admissionRoll,row.phone,row.guardianName,row.schoolName])if(value)assert.ok((await record.innerText()).includes(value));report.checks.push({name:'Persisted Student fields render in directory row',status:'Pass'});
 await teacher.getByRole('textbox',{name:'Search students',exact:true}).fill(row.guardianName);await teacher.waitForResponse(response=>response.url().includes('/students/directory?')&&new URL(response.url()).searchParams.get('q')===row.guardianName);await record.waitFor();check('Guardian search includes matching record',await record.count(),1);
 await teacher.getByRole('textbox',{name:'Search students',exact:true}).fill('DEMO-no-match-search');await teacher.getByRole('heading',{name:'No matching students',exact:true}).waitFor();report.checks.push({name:'Nonmatching search renders honest empty state',status:'Pass'});
 await teacher.getByRole('textbox',{name:'Search students',exact:true}).fill('');await record.waitFor();await teacher.screenshot({path:directory+'/students-desktop.png',fullPage:true});
 await record.getByRole('button',{name:'View profile for '+row.fullName,exact:true}).click();const full=teacher.getByRole('region',{name:'Student admission and full profile',exact:true});await full.getByLabel('Guardian name',{exact:true}).waitFor();check('Directory opens complete authorized profile',await full.getByLabel('Guardian name',{exact:true}).inputValue(),profile.guardian.fullName);
 check('Student cannot read Teacher directory',await student.evaluate(async()=>(await fetch('/api/v1/teacher/students/directory')).status),403);
 await student.getByRole('button',{name:'My profile',exact:true}).click();const own=student.getByRole('region',{name:'Your admission and profile',exact:true});await own.getByLabel('School / college',{exact:true}).waitFor();check('Student sees persisted academic record',await own.getByLabel('School / college',{exact:true}).inputValue(),profile.personal.schoolName);check('Guardian administrative contact stays absent for Student',await own.getByLabel('Alternate / emergency contact',{exact:true}).count(),0);
 report.status='Pass';
}catch(error){report.status='Fail';report.failure=error.message;console.error(error.message);process.exitCode=1;}
finally{writeFileSync(directory+'/student-data.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
