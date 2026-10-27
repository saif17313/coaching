/**
 * Browser E2E for the Effy-parity management workflows on a real deployment. Credentials come only from
 * EDUCENTRE_TEACHER_EMAIL / EDUCENTRE_STUDENT_EMAIL / EDUCENTRE_TEST_PASSWORD.
 * Everything it creates is labelled "E2E PARITY": one batch, one offline Student, one subject/exam.
 * Finance uses a deliberately tiny BDT 30 fee paid as 10 + 15 + 5 so the permanent ledger footprint is
 * minimal; the batch and the offline Student are cancelled at the end (history is never deleted).
 * Usage: node scripts/verify-management-parity.mjs <playwright-module> [origin]
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const [moduleUrl,origin='https://educentre-iota.vercel.app']=process.argv.slice(2);
if(!['http://localhost:3000','https://educentre-iota.vercel.app'].includes(origin))throw Error('Unreviewed origin.');
const {chromium}=await import(pathToFileURL(moduleUrl).href);
const env=k=>{const v=process.env[k];if(!v)throw Error(k+' is required');return v;};
const stamp=new Date().toISOString().replace(/\D/g,'').slice(0,14),tag=stamp.slice(-6);
const batchName=`E2E PARITY Batch ${tag}`,batchCode=`E2E-PAR-${tag}`,studentName=`E2E PARITY Student ${tag}`;
const period=new Date(Date.now()+6*3600000).toISOString().slice(0,7);
const dir='docs/evidence/2026-10-28';mkdirSync(dir,{recursive:true});
const report={time:new Date().toISOString(),origin,scope:'Labelled E2E PARITY batch, offline Student, subject and exam; BDT 30 test fee paid 10+15+5',checks:[]};
const check=(label,actual,expected)=>{assert.deepEqual(actual,expected,label);report.checks.push({label,status:'Pass',actual});console.log('PASS',label);};
const browser=await chromium.launch();
async function login(role,viewport={width:1440,height:900}){
 const page=await (await browser.newContext({viewport})).newPage();
 page.on('dialog',d=>void d.accept());
 await page.goto(origin+'/portal',{waitUntil:'domcontentloaded'});
 await page.getByLabel('Email address',{exact:true}).fill(env(role==='teacher'?'EDUCENTRE_TEACHER_EMAIL':'EDUCENTRE_STUDENT_EMAIL'));
 await page.getByLabel('Password',{exact:true}).fill(env('EDUCENTRE_TEST_PASSWORD'));
 const res=page.waitForResponse(r=>r.url().endsWith('/api/portal/auth/login')&&r.request().method()==='POST');
 await page.getByRole('button',{name:/^Sign in securely/}).click();
 assert.equal((await (await res).json()).data?.role,role);return page;
}
const api=(page,path,method='GET',body)=>page.evaluate(async({path,method,body})=>{const r=await fetch(path,{method,cache:'no-store',headers:body?{'Content-Type':'application/json','x-musa-ui':'1','Idempotency-Key':crypto.randomUUID()}:{},body:body?JSON.stringify(body):undefined});
 const type=r.headers.get('content-type')||'';return {status:r.status,type,body:type.includes('json')?await r.json().catch(()=>null):null};},{path,method,body});
async function nav(page,label){await page.getByRole('complementary').getByRole('button',{name:label,exact:true}).click();
 const registered=page.getByRole('button',{name:'Registered records',exact:true});await page.waitForTimeout(400);
 if(await registered.count()&&await registered.first().isVisible())await registered.first().click();}
const selectBatch=async(page,id)=>{await page.getByLabel('Selected batch').selectOption(id);};
let teacher,batchId,studentId,examId;
// Retire fixtures even after a failure: end every enrollment in the test batch (including the real Student
// test account's), cancel the offline Student, then cancel the batch. Records and ledger history stay.
let retiredStatus=null;
async function retire(){
 if(!teacher||!batchId||retiredStatus)return retiredStatus;
 const rows=(await api(teacher,`/api/v1/teacher/management/students?batchId=${batchId}&limit=50`)).body?.data?.students??[];
 for(const row of rows)for(const e of row.batches)if(e.batchId===batchId&&['pending','active'].includes(e.status))await api(teacher,`/api/v1/teacher/enrollments/${e.id}/decision`,'POST',{decision:'cancel'});
 if(studentId)await api(teacher,'/api/v1/teacher/management/student-lifecycle','POST',{studentId,status:'cancelled',reason:'E2E fixture retired'});
 retiredStatus=(await api(teacher,'/api/v1/teacher/management/batch-write','POST',{action:'update',batchId,data:{status:'cancelled',admissionOpen:false}})).body?.data?.status??null;
 return retiredStatus;
}
try{
 teacher=await login('teacher');const student=await login('student');
 const realStudent=(await api(student,'/api/v1/student/profile')).body?.data?.id;assert.match(String(realStudent),/^[0-9a-f-]{36}$/);

 // 1. Batch create through the studio form (profile, schedule, fees).
 await nav(teacher,'Batches');
 await teacher.getByRole('button',{name:'Create batch',exact:true}).first().click();
 const form=teacher.getByRole('dialog');
 await form.getByLabel('Batch name').fill(batchName);await form.getByLabel('Batch code').fill(batchCode);
 await form.getByLabel('Subject').fill('Physics (E2E)');await form.getByLabel('Class / level').fill('HSC 2027');await form.getByLabel('Academic session').fill('2026-27');
 await form.getByLabel('Capacity').fill('5');await form.getByLabel('Status').selectOption('running');
 for(const d of ['Sat','Mon','Wed'])await form.getByRole('button',{name:d,exact:true}).click();
 await form.getByLabel('Start time').fill('16:00');await form.getByLabel('End time').fill('17:30');
 await form.getByLabel('Monthly tuition').fill('30');await form.getByLabel('Admission fee').fill('0');
 const created=teacher.waitForResponse(r=>r.url().endsWith('/api/v1/teacher/management/batch-write')&&r.request().method()==='POST');
 await form.getByRole('button',{name:'Create batch',exact:true}).click();
 const createdBody=await (await created).json();check('Batch created via form',createdBody.success||createdBody.error?.code,true);batchId=createdBody.data.id;report.batchId=batchId;
 const card=teacher.locator('.mgmt-batch-card',{hasText:batchName});await card.waitFor();
 check('Batch card shows schedule and fee',[await card.getByText('Sat, Mon, Wed · 16:00–17:30').count(),await card.getByText('৳30',{exact:false}).count()>0],[1,true]);
 let profile=(await api(teacher,`/api/v1/teacher/management/batch-profile?batchId=${batchId}`)).body.data;
 check('Batch profile persisted',[profile.status,profile.capacity,profile.scheduleDays,profile.currentFee.monthlyFeeMinor],['running',5,[1,3,6],'3000']);
 // Edit capacity through the form.
 await card.getByRole('button',{name:'Edit',exact:true}).click();
 const edit=teacher.getByRole('dialog');await edit.getByLabel('Capacity').fill('6');
 const saved=teacher.waitForResponse(r=>r.url().endsWith('/batch-write'));await edit.getByRole('button',{name:'Save changes'}).click();check('Batch edit saved',(await (await saved).json()).data.capacity,6);

 // 2. Offline admission, enrollment, lifecycle transitions in the profile.
 await nav(teacher,'Students');
  await teacher.getByRole('button',{name:'Add student',exact:true}).first().click();
 const modal=teacher.getByRole('dialog');await modal.getByLabel('Student name',{exact:true}).fill(studentName);
 await modal.getByLabel('New Student Student phone').fill('01700000000');await modal.getByLabel('New Student Class').fill('HSC 2027');
 await modal.getByLabel('New Student Guardian name').fill('E2E Guardian');await modal.getByLabel('New Student Relationship').fill('Mother');await modal.getByLabel('New Student Guardian mobile').fill('01800000000');
 const offline=teacher.waitForResponse(r=>r.url().endsWith('/api/v1/teacher/students/offline'));await modal.getByRole('button',{name:'Admit student',exact:true}).click();
 studentId=(await (await offline).json()).data.studentId;report.studentId=studentId;
 const panel=teacher.getByRole('group',{name:'Student status'});await panel.waitFor({timeout:20000});
 await teacher.getByText('No portal login (offline record)').waitFor({timeout:20000});await teacher.waitForTimeout(3500);
 check('Lifecycle starts Active',await panel.locator('.mgmt-lifecycle-head .premium-badge').innerText(),'Active');
 await panel.getByRole('button',{name:'Mark inactive'}).click();await panel.getByLabel(/Reason/).fill('E2E temporary break');await panel.getByRole('button',{name:/Confirm: Mark inactive/}).click();
 await panel.getByText('Status changed to Inactive.').waitFor();await panel.locator('.mgmt-lifecycle-head .premium-badge',{hasText:'Inactive'}).waitFor();check('Marked inactive in UI',await panel.locator('.mgmt-lifecycle-head .premium-badge').innerText(),'Inactive');
 const blocked=await api(teacher,'/api/v1/teacher/enrollment-requests','POST',{studentId,batchId});check('Inactive Student cannot be enrolled',blocked.status>=400,true);
 await panel.getByRole('button',{name:'Reactivate'}).click();await panel.getByRole('button',{name:/Confirm: Reactivate/}).click();
 await panel.getByText('Status changed to Active.').waitFor();await panel.locator('.mgmt-lifecycle-head .premium-badge',{hasText:/^Active$/}).waitFor();check('Reactivated in UI',await panel.locator('.mgmt-lifecycle-head .premium-badge').innerText(),'Active');
 const req=await api(teacher,'/api/v1/teacher/enrollment-requests','POST',{studentId,batchId});await api(teacher,`/api/v1/teacher/enrollments/${req.body.data.id}/decision`,'POST',{decision:'approve'});
 const dir2=(await api(teacher,`/api/v1/teacher/management/students?batchId=${batchId}&lifecycle=active`)).body.data;check('Directory filters by batch and lifecycle',dir2.students.map(s=>s.fullName),[studentName]);

 // 3. Monthly billing from the batch detail, then installments in the ledger.
 await nav(teacher,'Batches');await teacher.locator('.mgmt-batch-card',{hasText:batchName}).getByRole('button',{name:'Manage'}).click();
 const detail=teacher.getByRole('dialog');await detail.getByLabel('Billing month').fill(period);
 const billed=teacher.waitForResponse(r=>r.url().endsWith('/bill-period'));await detail.getByRole('button',{name:'Generate dues'}).click();
 const bill=(await (await billed).json()).data;check('Monthly dues generated from fee rule',[bill.amountMinor,bill.created,bill.planCreated],['3000',1,true]);
 await detail.getByRole('button',{name:'Close batch details'}).click();
 await nav(teacher,'Payment ledger');await teacher.getByPlaceholder('Search Student, roll or batch…').fill(studentName);await teacher.locator('.mgmt-ledger-table tbody tr',{hasText:studentName}).first().waitFor();
 const ledgerRow=()=>teacher.locator('.mgmt-ledger-table tbody tr',{hasText:studentName}).first();
 async function pay(amount,method,reference){await ledgerRow().getByRole('button',{name:'Record payment'}).click();const d=teacher.getByRole('dialog');await d.getByLabel('Amount received (BDT)').fill(amount);await d.getByLabel('Method').selectOption(method);if(reference)await d.getByLabel(/Reference/).fill(reference);
  const posted=teacher.waitForResponse(r=>/\/payments\/post$/.test(r.url()));await d.getByRole('button',{name:'Record payment'}).click();return (await posted).status();}
 check('Installment 1 (BDT 10, cash) recorded',await pay('10','cash',''),201);
 let row=(await api(teacher,`/api/v1/teacher/management/payment-ledger?batchId=${batchId}&period=${period}`)).body.data.rows[0];check('After installment 1: partial, BDT 20 due',[row.status,row.paidMinor,row.outstandingMinor],['partial','1000','2000']);
 check('Installment 2 (BDT 15, mobile banking) recorded',await pay('15','mobile_banking','E2E-TRX-'+tag),201);
 row=(await api(teacher,`/api/v1/teacher/management/payment-ledger?batchId=${batchId}&period=${period}`)).body.data.rows[0];check('After installment 2: partial, BDT 5 due, 2 separate payments',[row.status,row.outstandingMinor,row.payments.length],['partial','500',2]);
 await ledgerRow().getByText('৳5',{exact:true}).waitFor();
 await ledgerRow().getByRole('button',{name:'Record payment'}).click();const over=teacher.getByRole('dialog');await over.getByLabel('Amount received (BDT)').fill('6');await over.getByRole('button',{name:'Record payment'}).click();
 check('Overpayment blocked',await over.getByRole('alert').innerText().then(t=>/more than the outstanding|larger than the outstanding|exceeds/i.test(t)),true);await over.getByRole('button',{name:'Cancel'}).click();
 check('Ledger unchanged after blocked overpayment',(await api(teacher,`/api/v1/teacher/management/payment-ledger?batchId=${batchId}&period=${period}`)).body.data.rows[0].outstandingMinor,'500');
 check('Final installment (BDT 5) recorded',await pay('5','cash',''),201);
 row=(await api(teacher,`/api/v1/teacher/management/payment-ledger?batchId=${batchId}&period=${period}`)).body.data.rows[0];check('Fully paid after 3 installments',[row.status,row.paidMinor,row.outstandingMinor,row.payments.length],['paid','3000','0',3]);
 const receiptIssue=await api(teacher,`/api/v1/teacher/payments/${row.payments[0].id}/receipt`,'POST',{});check('Receipt issued for installment 1',receiptIssue.status<300,true);
 const receipt=await teacher.evaluate(async id=>{const r=await fetch(`/api/v1/teacher/payments/${id}/receipt`,{cache:'no-store'});const b=new Uint8Array(await r.arrayBuffer());return [r.status,r.headers.get('content-type'),String.fromCharCode(...b.slice(0,5))];},row.payments[0].id);
 check('Receipt PDF downloads',receipt,[200,'application/pdf','%PDF-']);
 await teacher.screenshot({path:`${dir}/ledger-teacher.png`});

 // 4. Academics: subject, chapter/topic progress, offline exam with attendance and publication.
 const subject=await teacher.evaluate(async({batchId})=>{const r=await fetch(`/api/v1/teacher/batches/${batchId}/subjects/create`,{method:'POST',headers:{'Content-Type':'application/json','x-musa-ui':'1','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({code:'PHYE2E',title:'Physics E2E'})});return r.json();},{batchId});
 check('Subject created',subject.success,true);
 // The real test Student joins after billing, so no dues are created for that account.
 const realReq=await api(teacher,'/api/v1/teacher/enrollment-requests','POST',{studentId:realStudent,batchId});await api(teacher,`/api/v1/teacher/enrollments/${realReq.body.data.id}/decision`,'POST',{decision:'approve'});
 await nav(teacher,'Syllabus');await selectBatch(teacher,batchId);
 await teacher.getByLabel('New chapter in Physics E2E').fill('Vectors');await teacher.getByRole('button',{name:'+ Chapter'}).click();
 await teacher.getByLabel('New topic in Vectors').waitFor();await teacher.getByLabel('New topic in Vectors').fill('Vector addition');await teacher.getByRole('button',{name:'+ Topic'}).click();
 await teacher.getByLabel('Vector addition status').waitFor();
 await teacher.getByLabel('New topic in Vectors').fill('Resolution');await teacher.getByRole('button',{name:'+ Topic'}).click();await teacher.getByLabel('Resolution status').waitFor();
 await teacher.getByLabel('Vector addition status').selectOption('completed');await teacher.waitForResponse(r=>r.url().endsWith('/syllabus-write'));
 await teacher.locator('.mgmt-syllabus-summary').getByText('50%').waitFor();
 check('Syllabus progress 50% after 1 of 2 topics',(await api(teacher,`/api/v1/teacher/management/syllabus?batchId=${batchId}`)).body.data.progressBasisPoints,5000);
 const past=new Date(Date.now()-3600000),local=new Date(past.getTime()-past.getTimezoneOffset()*60000).toISOString().slice(0,16);
 await nav(teacher,'Examinations');await teacher.getByRole('button',{name:'+ Create exam draft'}).click();const examForm=teacher.getByRole('dialog');
 await examForm.getByLabel('Subject').selectOption({label:'Physics E2E'});await examForm.getByLabel('Title').fill('E2E PARITY Weekly '+tag);await examForm.getByLabel('Scheduled date').fill(local);await examForm.getByLabel('Maximum marks').fill('50');
 await examForm.getByRole('button',{name:/Save securely/}).click();await teacher.getByText('E2E PARITY Weekly '+tag).waitFor();
 const examCard=teacher.locator('.academic-card',{hasText:'E2E PARITY Weekly '+tag});await examCard.getByRole('button',{name:'Details'}).click();
 const details=teacher.getByRole('dialog');await details.getByLabel('Type').selectOption('weekly');await details.getByLabel('Pass marks').fill('20');await details.getByLabel('Duration (minutes)').fill('60');
 await details.getByLabel('Vectors',{exact:true}).check();const examSaved=teacher.waitForResponse(r=>r.url().endsWith('/exam-details'));await details.getByRole('button',{name:'Save exam details'}).click();
 examId=(await (await examSaved).json()).data.id;check('Exam details saved (type, pass marks, coverage)',typeof examId,'string');
 await examCard.getByRole('button',{name:/Schedule \(publish\)/}).click();await examCard.getByText('published').waitFor();
 await nav(teacher,'Results');const sheet=teacher.locator('.mgmt-exam-sheet');await sheet.getByLabel('Choose exam').selectOption({label:'E2E PARITY Weekly '+tag});
 await sheet.getByLabel(`${studentName} attendance`).waitFor();
 const realName=(await api(teacher,`/api/v1/teacher/management/exam-sheet?examId=${examId}`)).body.data.rows.find(r=>r.studentId===realStudent).fullName;
 check('Unrecorded Students show "Not recorded"',await sheet.getByLabel(`${realName} attendance`).inputValue(),'not_recorded');
 await sheet.getByLabel(`${realName} attendance`).selectOption('attempted');await sheet.getByLabel(`${realName} marks`).fill('42');await sheet.getByLabel(`${realName} remarks`).fill('Strong vectors work');
 let saveRes=teacher.waitForResponse(r=>r.url().endsWith('/exam-attendance'));await sheet.locator('tr',{hasText:realName}).getByRole('button',{name:'Save'}).click();check('Attempted marks saved',(await saveRes).status(),200);
 await sheet.getByLabel(`${studentName} attendance`).selectOption('absent');saveRes=teacher.waitForResponse(r=>r.url().endsWith('/exam-attendance'));await sheet.locator('tr',{hasText:studentName}).getByRole('button',{name:'Save'}).click();check('Absence saved without marks',(await saveRes).status(),200);
 await sheet.getByRole('button',{name:/Publish results/}).click();await sheet.getByText('Results published to enrolled Students.').waitFor();
 const published=(await api(teacher,`/api/v1/teacher/management/exam-sheet?examId=${examId}`)).body.data;
 check('Published sheet: rank for attempted, none for absent',published.rows.map(r=>[r.participation,r.rank,r.resultStatus]).sort(),[['absent',null,'published'],['attempted',1,'published']]);
 const sheetPdf=await teacher.evaluate(async id=>{const r=await fetch(`/api/v1/teacher/reports/exam/${id}`);const b=new Uint8Array(await r.arrayBuffer());return [r.status,r.headers.get('content-type'),String.fromCharCode(...b.slice(0,5))];},examId);
 check('Result sheet PDF',sheetPdf,[200,'application/pdf','%PDF-']);

 // 5. Student portal reflects published data only.
 await student.reload({waitUntil:'domcontentloaded'});
 const history=(await api(student,'/api/v1/student/academic/exam-history')).body.data.exams.find(x=>x.id===examId);
 check('Student sees own attempted result with rank',[history.participation,Number(history.marks),history.rank,history.examType,history.passMarks],['attempted',42,1,'weekly',20]);
 check('Student sees syllabus progress',(await api(student,`/api/v1/student/academic/syllabus?batchId=${batchId}`)).body.data.progressBasisPoints,5000);
 const progressPdf=await student.evaluate(async()=>{const r=await fetch('/api/v1/student/reports/progress');const b=new Uint8Array(await r.arrayBuffer());return [r.status,r.headers.get('content-type'),String.fromCharCode(...b.slice(0,5))];});
 check('Student progress report PDF',progressPdf,[200,'application/pdf','%PDF-']);
 await nav(student,'Exams');await selectBatch(student,batchId);await student.locator('.mgmt-exam-card',{hasText:'E2E PARITY Weekly '+tag}).getByText('42/50').waitFor();
 check('Student exam card shows marks in the portal UI',await student.locator('.mgmt-exam-card',{hasText:'E2E PARITY Weekly '+tag}).locator('.premium-badge').innerText(),'Attempted');
 await student.screenshot({path:`${dir}/student-exams.png`});

 // 6. Security boundaries.
 check('Student cannot read the Teacher ledger',(await api(student,'/api/v1/teacher/management/payment-ledger')).status,403);
 check('Student cannot change lifecycle',(await api(student,'/api/v1/teacher/management/student-lifecycle','POST',{studentId,status:'cancelled',reason:'intrusion'})).status,403);
 check('Enrolled Student can read the batch profile',(await api(student,`/api/v1/student/academic/batch-profile?batchId=${profile.id}`)).status,200);
 const anon=await (await browser.newContext()).newPage();await anon.goto(origin+'/portal',{waitUntil:'domcontentloaded'});
 check('Anonymous management read denied',(await api(anon,'/api/v1/teacher/management/students')).status,401);
 check('Unknown management action rejected',(await api(teacher,'/api/v1/teacher/management/drop-everything')).status,404);

 // 7. Mobile layout: no horizontal overflow on the portal and the public site.
 const mobile=await login('teacher',{width:375,height:780});await nav(mobile,'Batches').catch(async()=>{await mobile.getByRole('button',{name:'Open navigation'}).click();await nav(mobile,'Batches');});
 await mobile.locator('.mgmt-batch-card').first().waitFor();
 check('Portal batches fit 375px',await mobile.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);await mobile.screenshot({path:`${dir}/batches-375.png`});
 for(const width of [360,768,1440,1920]){const p=await (await browser.newContext({viewport:{width,height:900}})).newPage();await p.goto(origin+'/',{waitUntil:'networkidle'});await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await p.waitForTimeout(1200);
  check(`Public home has no horizontal overflow at ${width}px`,await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
  check(`Revealed content visible at ${width}px`,await p.evaluate(()=>document.querySelectorAll('.reveal-pending:not(.is-revealed)').length===0||!document.querySelector('.motion-ready')),true);await p.context().close();}

 check('Fixture batch cancelled (history kept)',await retire(),'cancelled');
 report.status='Pass';
}catch(e){report.status='Fail';report.failure=e.message;process.exitCode=1;console.error('FAIL',e.message);if(teacher)await teacher.screenshot({path:`${dir}/parity-failure.png`}).catch(()=>{});await retire().catch(()=>{});}
finally{writeFileSync(`${dir}/management-parity${origin.includes('localhost')?'-local':''}.json`,JSON.stringify(report,null,1));await browser.close();}
