import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {financeList,financeCommand,financeCsv,minorToBDT,parseBDTToMinor} from '../src/client/teacher-finance.mjs';
const batch='b9b35832-394b-4514-831a-bebc88684311';
const plan='a7f6f055-cd3c-4a3e-99ef-d5e2b2e4d011';
const student='eee6742d-14bc-437b-983a-4d1803d8d6b8';
const due='9e70dc6d-1ee9-4aec-b8c5-4c8979f5af2d';
const op='b2329d7b-19ac-476a-a1bb-07aab5fe75f1';
const expense='12c931bd-4a89-4d6f-91d3-9ad5fa704a23';
const ok=data=>new Response(JSON.stringify({success:true,data}),{status:200,headers:{'Content-Type':'application/json'}});
const payload=(res,status)=>new Response(JSON.stringify(res),{status,headers:{'Content-Type':'application/json'}});
const record=(x={})=>({id:plan,batchId:batch,amountMinor:150000,...x});
const collect=()=>{const calls=[];return {calls,fetch:async(u,o)=>{calls.push({u,o});return ok({id:plan,batchId:batch,period:'2026-10',amountMinor:150000,dueOn:'2026-10-25',label:'Monthly tuition'});}}};
test('BDT conversion is paisa-exact, including leading zeros and cents',()=>{
 assert.equal(parseBDTToMinor('1250.09'),125009);assert.equal(parseBDTToMinor('0002.5'),250);
 assert.equal(minorToBDT('125009'),'৳1,250.09');assert.equal(minorToBDT(-101),'−৳1.01');
 for(const x of ['0','12.345','-3','2e5','NaN','', '1,000', '1000000000'])assert.throws(()=>parseBDTToMinor(x));
});
test('plan command uses cookie, CSRF header, idempotency and exact schema',async()=>{
 const {calls,fetch}=collect();
 await financeCommand('plan',batch,{period:'2026-10',amountMinor:150000,dueOn:'2026-10-25',label:'Monthly tuition'},fetch,()=>op);
 assert.equal(calls.length,1);assert.equal(calls[0].u,`/api/v1/teacher/batches/${batch}/fee-plans/create`);
 assert.equal(calls[0].o.credentials,'same-origin');assert.equal(calls[0].o.headers['x-musa-ui'],'1');assert.equal(calls[0].o.headers['Idempotency-Key'],op);
 assert.equal(calls[0].o.method,'POST');assert.deepEqual(Object.keys(JSON.parse(calls[0].o.body)).sort(),['amountMinor','dueOn','label','period'].sort());
 assert.equal(JSON.stringify(calls).includes('service_role'),false);
});
test('invalid finance commands fail before any network call',async()=>{
 const spy=collect();
 assert.throws(()=>financeCommand('plan',batch,{period:'2026-13',amountMinor:10,dueOn:'2026-10-25',label:'Fee'},spy.fetch,()=>op));
 assert.throws(()=>financeCommand('payment',due,{studentId:student,amountMinor:0,method:'cash',reference:''},spy.fetch,()=>op));
 assert.throws(()=>financeCommand('expense',batch,{expenseOn:'2026-10-20',category:'illegal',payee:'John',notes:'',amountMinor:1,method:'cash',reference:''},spy.fetch,()=>op));
 assert.throws(()=>financeCommand('waiver',due,{amountMinor:100,reason:'x'},spy.fetch,()=>op));
 assert.throws(()=>financeCommand('plan','bad',{period:'2026-10',amountMinor:1,dueOn:'2026-10-20',label:'X'},spy.fetch,()=>op));
 assert.equal(spy.calls.length,0);
});
test('dues generate body is exactly empty JSON with new operation receipt',async()=>{
 const calls=[];await financeCommand('generate',plan,{},async(url,opts)=>{calls.push([url,opts]);return ok({planId:plan,created:2});},()=>op);
 assert.equal(calls[0][0],`/api/v1/teacher/fee-plans/${plan}/dues/generate`);assert.equal(calls[0][1].body,'{}');
});
test('payment, waiver, refund and reversal use exact routed objects',async()=>{
 const cases=[
  ['payment',due,{studentId:student,amountMinor:100,method:'mobile_banking',reference:''},`/api/v1/teacher/dues/${due}/payments/post`],
  ['waiver',due,{amountMinor:100,reason:'Merit scholarship'},`/api/v1/teacher/dues/${due}/waive`],
  ['refund',plan,{amountMinor:100,reason:'Duplicate payment'},`/api/v1/teacher/payments/${plan}/refund`],
  ['reverse',expense,{reason:'Incorrect receipt'},`/api/v1/teacher/expenses/${expense}/reverse`]
 ];
 for(const [kind,target,body,url] of cases){let seen=null;await financeCommand(kind,target,body,async(u,options)=>{seen={u,options};return ok({});},()=>op);assert.equal(seen.u,url);assert.deepEqual(JSON.parse(seen.options.body),body);}
});
test('read scopes permit only allowlisted routes and bounded pagination',async()=>{
 let actual='';const data={batch:{id:batch},items:[record()]};
 await financeList('plans',batch,{billPeriod:'2026-10',limit:20,offset:0},async(u,o)=>{actual=u;assert.equal(o.method,'GET');return ok(data);});
 assert.equal(actual,`/api/v1/teacher/batches/${batch}/fee-plans?billPeriod=2026-10&limit=20&offset=0`);
 assert.throws(()=>financeList('payments',batch,{}));assert.throws(()=>financeList('plans',batch,{limit:100}));
 assert.throws(()=>financeList('finance',batch,{billPeriod:'2026-00'}));
});
test('expense GET preserves period query and validates response without nonexistent batch metadata',async()=>{
 const dto={period:'2026-10',batchId:batch,total:1,items:[{id:expense,batchId:batch,amountMinor:100}]};
 const result=await financeList('expenses',batch,{billPeriod:'2026-10'},async(url)=>{assert.match(url,/expenses\?period=2026-10&limit=20&offset=0$/);return ok(dto);});
 assert.equal(result.items.length,1);
});
test('different batch/due and duplicate list projections fail closed',async()=>{
 const foreign={batch:{id:batch},items:[record({batchId:due})]};
 await assert.rejects(financeList('plans',batch,{},async()=>ok(foreign)),/Cross-batch/);
 await assert.rejects(financeList('dues',batch,{},async()=>ok({batch:{id:batch},items:[record({id:due}),record({id:due})]})),/Invalid finance record/);
 await assert.rejects(financeList('duePayments',due,{},async()=>ok({due:{id:due},items:[{id:plan,dueId:batch}]})),/Foreign due/);
});
test('cashflow expects trusted server reconciliation shape and formatted export',async()=>{
 const good={batchId:batch,period:'2026-10',currency:'BDT',unit:'paisa',basis:'posted_utc',netCashFlowMinor:'125000'};
 assert.equal((await financeList('finance',batch,{billPeriod:'2026-10'},async()=>ok(good))).netCashFlowMinor,'125000');
 await assert.rejects(financeList('finance',batch,{billPeriod:'2026-10'},async()=>ok({...good,batchId:due})),/Invalid financial/);
 assert.equal(financeCsv('cashflow',batch,'2026-10'),`/api/v1/teacher/batches/${batch}/cashflow/export?period=2026-10`);
 assert.throws(()=>financeCsv('payments',batch,'2026-10'));
});
test('auth gate failures surface explicit warning, never pretend to save',async()=>{
 await assert.rejects(financeCommand('generate',plan,{},async()=>payload({success:false,error:{code:'SERVICE_UNAVAILABLE'}},503),()=>op),/service is temporarily unavailable/);
 await assert.rejects(financeList('plans',batch,{},async()=>payload({success:false,error:{code:'FORBIDDEN'}},403)),/not authorized/);
});
test('Finance Studio uses validated shared client and never accesses auth tokens',()=>{
 const client=readFileSync('src/components/portal/TeacherFinanceStudio.tsx','utf8');const portal=readFileSync('src/components/portal/PortalClient.tsx','utf8');
 for(const m of ['finance','plans','dues','expenses'])assert.match(portal,new RegExp(`id:'${m}'`));
 assert.match(client,/financeList\(/);assert.match(client,/financeCommand\(/);
 assert.match(client,/window\.confirm/);assert.match(client,/minorToBDT/);
 assert.doesNotMatch(client,/service_role|localStorage|Bearer /i);
 assert.match(portal,/isTeacherFinance&&batch\?<TeacherFinanceStudio/);
});
