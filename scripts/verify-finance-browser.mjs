// Executes only the exact DEV DEMO ledger amounts explicitly approved in this session.
import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href);
const teacherBrowser=await chromium.connectOverCDP('http://127.0.0.1:9333'),studentBrowser=await chromium.connectOverCDP('http://127.0.0.1:9334');
async function find(b,role){for(const p of b.contexts().flatMap(c=>c.pages()))if(p.url().startsWith('http://localhost:3000')&&await p.evaluate(async role=>{const r=await fetch('/api/portal/auth/session');return r.ok&&(await r.json()).data?.role===role;},role))return p;throw Error(role+' session required');}
const teacher=await find(teacherBrowser,'teacher'),student=await find(studentBrowser,'student');
const file='docs/evidence/2026-10-20/finance-browser.json',batchId=JSON.parse(readFileSync('docs/evidence/2026-10-20/system-browser.json')).records.batchId,studentId=JSON.parse(readFileSync('docs/evidence/2026-10-20/student-invite.json')).body.data.studentId;
const report=existsSync(file)?JSON.parse(readFileSync(file)):{time:new Date().toISOString(),project:'rkpwqgwceekuvlizfpeb',approval:'Explicit user approval for BDT 1 fee, 0.60 payment, 0.10 waiver, 0.20 refund, BDT 1 expense and reversal; DEV DEMO only.',records:{batchId,studentId},operations:{},checks:[]};
const save=()=>writeFileSync(file,JSON.stringify(report,null,2)+'\n');
const api=(page,path,method='GET',body,operation)=>page.evaluate(async({path,method,body,operation})=>{const r=await fetch(path,{method,cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json','x-musa-ui':'1','Idempotency-Key':operation},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};},{path,method,body,operation});
const check=(name,actual,expected)=>{assert.deepEqual(actual,expected,name);if(!report.checks.some(x=>x.name===name))report.checks.push({name,status:'Pass'});console.log('PASS '+name);save();};
async function command(name,path,body,status=201){report.operations[name]??=crypto.randomUUID();save();const r=await api(teacher,path,'POST',body,report.operations[name]);check(name+' HTTP',r.status,status);return r.body.data;}
try{
 const root=`/api/v1/teacher/batches/${batchId}`;
 const plan=await command('DEMO fee plan',root+'/fee-plans/create',{period:'2026-10',amountMinor:100,dueOn:'2026-10-25',label:'DEMO approved finance verification only'});report.records.planId=plan.id;save();
 const generation=await command('DEMO dues generation',`/api/v1/teacher/fee-plans/${plan.id}/dues/generate`,{});check('one approved DEMO Student billed',generation.created,1);
 const dues=(await api(teacher,root+'/dues?billPeriod=2026-10')).body.data.items,due=dues.find(x=>x.feePlanId===plan.id&&x.studentId===studentId);assert.ok(due,'independent generated due read-back');report.records.dueId=due.id;check('generated DEMO due amount',due.amountMinor,100);
 const payment=await command('DEMO payment',`/api/v1/teacher/dues/${due.id}/payments/post`,{studentId,amountMinor:60,method:'cash',reference:'DEMO TEST ONLY - no money moved'});report.records.paymentId=payment.id;save();
 await command('DEMO waiver',`/api/v1/teacher/dues/${due.id}/waive`,{amountMinor:10,reason:'DEMO approved waiver verification; no real financial activity'});
 await command('DEMO refund',`/api/v1/teacher/payments/${payment.id}/refund`,{amountMinor:20,reason:'DEMO approved refund verification; no real money moved'});
 const expense=await command('DEMO expense',root+'/expenses/create',{expenseOn:'2026-10-20',category:'other',payee:'DEMO TEST ONLY',notes:'Approved verification entry. No real expense.',amountMinor:100,method:'cash',reference:'DEMO TEST ONLY - no money moved'});report.records.expenseId=expense.id;save();
 await command('DEMO expense reversal',`/api/v1/teacher/expenses/${expense.id}/reverse`,{reason:'DEMO approved reversal of verification-only expense'},201);
 const reportRead=await api(teacher,root+'/cashflow?period=2026-10');check('reconciled Teacher cashflow read',reportRead.status,200);report.cashflow=reportRead.body.data;save();
 for(const [key,value]of Object.entries({grossCollectionsMinor:'60',refundsMinor:'20',netCollectionsMinor:'40',grossExpensesMinor:'100',reversedExpensesMinor:'100',netExpensesMinor:'0',netCashFlowMinor:'40',waiversMemoMinor:'10',billedMemoMinor:'100'}))check('reconciliation '+key,report.cashflow[key],value);
 const billing=await api(student,'/api/v1/student/billing?billPeriod=2026-10');check('Student reads own billing',billing.status,200);report.billing=billing.body.data;save();
 const payments=await api(student,'/api/v1/student/payments');check('Student sees own DEMO receipt',payments.body.data.items.some(x=>x.id===payment.id&&x.studentId===studentId),true);
 const csv=await api(teacher,root+'/cashflow/export?period=2026-10');check('verified Teacher cashflow CSV',csv.status,200);
 const ownCsv=await api(student,'/api/v1/student/billing/export?billPeriod=2026-10');check('Student own billing CSV',ownCsv.status,200);
 check('Student denied Teacher finance write',(await api(student,`/api/v1/teacher/dues/${due.id}/payments/post`,'POST',{studentId,amountMinor:1,method:'cash',reference:'denied authorization probe'},crypto.randomUUID())).status,403);
 report.status='Pass';delete report.failure;
}catch(e){report.status='Fail';report.failure=e.message;console.error(e.message);process.exitCode=1;}
finally{save();await teacherBrowser.close();await studentBrowser.close();}
