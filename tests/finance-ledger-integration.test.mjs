import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createFinanceOperations, calculateInvoiceOutstanding, safeCsvCell} from '../src/server/services/finance-ledger.mjs';

const [teacherId,studentId,otherStudentId,outsiderId,batchId,otherBatchId] = Array.from({length:6},randomUUID);
const teacher = {id:teacherId,role:'teacher',verified:true};
const student = {id:studentId,role:'student',verified:true};
const outsider = {id:outsiderId,role:'teacher',verified:true};
const id = randomUUID;
const copy = v => structuredClone(v);
const plan = () => ({id:id(),batchId,period:'2026-10',amountMinor:100_00,dueOn:'2026-10-30',label:'October fee'});

function mockPort(opts={}) {
  let state={plans:{},invoices:{},payments:{},adjustments:{},commands:{},audit:[]};
  let inFlight=false;
  const memberships=new Map([[studentId,'active'],[otherStudentId,'pending']]);
  const txOf=s=>({
    async assertTeacherManagesBatch(actor,batch) {if(actor!==teacherId||batch!==batchId)throw Error('BATCH_ACCESS_DENIED');},
    async insertFeePlan(p) {if(Object.values(s.plans).some(x=>x.batchId===p.batchId&&x.period===p.period))throw Error('DUPLICATE_PERIOD');s.plans[p.id]=copy(p);return copy(p);},
    async getFeePlanLocked(planId) {return copy(s.plans[planId]??null);},
    async createDuesForActiveEnrollments(p) {
      let count=0;
      for(const [studentId,status] of memberships) {
        if(status!=='active') continue;
        if(Object.values(s.invoices).some(x=>x.studentId===studentId&&x.planId===p.id)) continue;
        const invoice={id:id(),studentId,batchId:p.batchId,planId:p.id,period:p.period,currency:'BDT',status:'open',amountMinor:p.amountMinor,paidMinor:0,waivedMinor:0,refundedMinor:0,correctedMinor:0};
        s.invoices[invoice.id]=invoice;count++;
      }
      return {created:count};
    },
    async claimOperation(op,action,target,actorId) {
      const prev=s.commands[op];
      if(!prev){s.commands[op]={op,action,target,actorId,pending:true};return null;}
      if(prev.action!==action||prev.target!==target||prev.actorId!==actorId||prev.pending)throw Error('OPERATION_ID_CONFLICT');
      return copy(prev.result);
    },
    async completeOperation(op,result){if(!s.commands[op]?.pending)throw Error('UNCLAIMED_OPERATION');s.commands[op]={...s.commands[op],pending:false,result:copy(result)};},
    async getInvoiceLocked(actor,invoiceId){if(actor!==teacherId)throw Error('FORBIDDEN');return copy(s.invoices[invoiceId]??null);},
    async getPaymentLocked(actor,paymentId){if(actor!==teacherId)throw Error('FORBIDDEN');return copy(s.payments[paymentId]??null);},
    async insertPayment(item,actor){if(actor!==teacherId)throw Error('FORBIDDEN');if(s.payments[item.id])throw Error('PAYMENT_EXISTS');const inv=s.invoices[item.invoiceId];if(!inv||inv.studentId!==item.studentId)throw Error('INVALID_RELATIONSHIP');s.payments[item.id]={...copy(item),refundedMinor:0,corrected:false};inv.paidMinor+=item.amountMinor;return copy(s.payments[item.id]);},
    async insertAdjustment(item,actor) {
      if(actor!==teacherId)throw Error('FORBIDDEN');if(s.adjustments[item.id])throw Error('ADJUSTMENT_EXISTS');
      const inv=s.invoices[item.invoiceId];if(!inv)throw Error('MISSING_INVOICE');
      if(item.kind==='waiver')inv.waivedMinor+=item.amountMinor;
      if(item.kind==='refund'){const pay=s.payments[item.paymentId];if(!pay||pay.invoiceId!==inv.id)throw Error('WRONG_PAYMENT');pay.refundedMinor+=item.amountMinor;inv.refundedMinor+=item.amountMinor;}
      if(item.kind==='correction'){const pay=s.payments[item.paymentId];if(!pay||pay.invoiceId!==inv.id)throw Error('WRONG_PAYMENT');pay.corrected=true;inv.correctedMinor+=item.amountMinor;}
      s.adjustments[item.id]=copy(item);
      if(calculateInvoiceOutstanding(inv)<0)throw Error('NEGATIVE_OUTSTANDING');
      return copy(item);
    },
    async appendAudit(item) {s.audit.push(copy(item));if(opts.failAudit && item.action===opts.failAudit)throw Error('AUDIT_WRITE_FAILED');}
  });
  const port={
    async inTransaction(fn) {
      if(inFlight)throw Error('TEST_PORT_NESTED_TX');inFlight=true;
      try {const draft=copy(state);const result=await fn(txOf(draft));state=draft;return copy(result);}finally{inFlight=false;}
    },
    async listStudentPaymentsAuthorized(actor,target,q) {
      if((actor.role==='student'&&actor.id!==target)||(actor.role==='teacher'&&actor.id!==teacherId))throw Error('FORBIDDEN');
      const rows=Object.values(state.invoices).filter(v=>v.studentId===target);
      if(opts.leakStudent) rows.push({...rows[0],studentId:otherStudentId});
      return copy(rows.slice(q.offset,q.offset+q.limit));
    },
    async getBatchFinanceReportAuthorized(actor,batch,filter) {
      if(actor.id!==teacherId)throw Error('FORBIDDEN');
      const rows=Object.values(state.invoices).filter(v=>v.batchId===batch&&(!filter.period||v.period===filter.period)).map(v=>({batchId:v.batchId,studentId:v.studentId,reference:opts.injection??'paid',period:v.period,amountMinor:v.amountMinor,outstandingMinor:calculateInvoiceOutstanding(v)}));
      if(opts.leakBatch)rows.push({...rows[0],batchId:otherBatchId});
      return copy(rows.slice(filter.offset,filter.offset+filter.limit));
    },
    async listFinancialAuditAuthorized(actor,q){if(actor.id!==teacherId)throw Error('FORBIDDEN');return copy(state.audit.slice(q.offset,q.offset+q.limit));}
  };
  return {ops:createFinanceOperations(port),state:()=>copy(state),port,setMemberStatus:(student,status)=>memberships.set(student,status)};
}
async function setup(f=mockPort()) {
  const p=plan();await f.ops.createFeePlan(teacher,p);
  await f.ops.generateMonthlyDues(teacher,{planId:p.id,operationId:id()});
  const due=Object.values(f.state().invoices)[0];
  return {f,p,due};
}
const payment = (invoiceId, amountMinor=4000, student=studentId) => ({id:id(),invoiceId,studentId:student,amountMinor,method:'cash',operationId:id()});

test('monthly plan validates BDT minor units, due date, duplicate periods, teacher roles', async()=>{
  const f=mockPort();const p=plan();
  await assert.rejects(()=>f.ops.createFeePlan(student,p),/FORBIDDEN/);
  await assert.rejects(()=>f.ops.createFeePlan(teacher,{...p,amountMinor:19.99}),/INVALID_FEE_PLAN/);
  await assert.rejects(()=>f.ops.createFeePlan(teacher,{...p,dueOn:'2026-02-30'}),/INVALID_FEE_PLAN/);
  await assert.rejects(()=>f.ops.createFeePlan(teacher,{...p,period:'2026-13'}),/INVALID_FEE_PLAN/);
  await assert.rejects(()=>f.ops.createFeePlan(outsider,p),/BATCH_ACCESS_DENIED/);
  const saved=await f.ops.createFeePlan(teacher,p);assert.equal(saved.currency,'BDT');
  await assert.rejects(()=>f.ops.createFeePlan(teacher,{...p,id:id()}),/DUPLICATE_PERIOD/);
  assert.equal(f.state().audit.length,1);
});

test('monthly dues are generated once for active enrollment; replay does not double-charge',async()=>{
  const f=mockPort();const p=plan();await f.ops.createFeePlan(teacher,p);
  const op=id();assert.deepEqual(await f.ops.generateMonthlyDues(teacher,{planId:p.id,operationId:op}),{created:1});
  assert.deepEqual(await f.ops.generateMonthlyDues(teacher,{planId:p.id,operationId:op}),{created:1});
  assert.deepEqual(await f.ops.generateMonthlyDues(teacher,{planId:p.id,operationId:id()}),{created:0});
  assert.equal(Object.keys(f.state().invoices).length,1);
  assert.equal(f.state().audit.filter(x=>x.action==='dues.generated').length,2);
});

test('payment partial, replay, overpayment and invalid relationship are guarded',async()=>{
  const {f,due}=await setup();const p=payment(due.id);
  assert.equal((await f.ops.recordPayment(teacher,p)).amountMinor,4000);
  assert.equal((await f.ops.recordPayment(teacher,p)).id,p.id);
  assert.equal(f.state().invoices[due.id].paidMinor,4000);
  await assert.rejects(()=>f.ops.recordPayment(teacher,payment(due.id,6001)),/PAYMENT_EXCEEDS_OUTSTANDING/);
  await assert.rejects(()=>f.ops.recordPayment(teacher,payment(due.id,100,otherStudentId)),/PAYMENT_RELATIONSHIP_MISMATCH/);
  await assert.rejects(()=>f.ops.recordPayment(student,payment(due.id)),/FORBIDDEN/);
  assert.equal(f.state().audit.filter(x=>x.action==='payment.posted').length,1);
});

test('waiver limits, refund changes outstanding and cannot exceed payment',async()=>{
  const {f,due}=await setup();const p=payment(due.id);await f.ops.recordPayment(teacher,p);
  const w={id:id(),invoiceId:due.id,amountMinor:2000,reason:'Low income support',operationId:id()};
  await f.ops.waiveDue(teacher,w);
  assert.equal(calculateInvoiceOutstanding(f.state().invoices[due.id]),4000);
  await assert.rejects(()=>f.ops.waiveDue(teacher,{...w,id:id(),operationId:id(),amountMinor:4001}),/WAIVER_EXCEEDS_OUTSTANDING/);
  const refund={id:id(),paymentId:p.id,amountMinor:1500,reason:'Duplicate payment',operationId:id()};
  await f.ops.refundPayment(teacher,refund);
  assert.equal(calculateInvoiceOutstanding(f.state().invoices[due.id]),5500);
  await assert.rejects(()=>f.ops.refundPayment(teacher,{...refund,id:id(),operationId:id(),amountMinor:2501}),/REFUND_EXCEEDS_PAYMENT/);
});

test('correction is compensating entry, payment immutable, cannot correct refunded payments',async()=>{
  const {f,due}=await setup();const p=payment(due.id,5000);await f.ops.recordPayment(teacher,p);
  await f.ops.correctPayment(teacher,{id:id(),paymentId:p.id,newAmountMinor:3000,reason:'Clerical error',operationId:id()});
  assert.equal(f.state().payments[p.id].amountMinor,5000);
  assert.equal(f.state().invoices[due.id].correctedMinor,-2000);
  assert.equal(calculateInvoiceOutstanding(f.state().invoices[due.id]),7000);
  await assert.rejects(()=>f.ops.correctPayment(teacher,{id:id(),paymentId:p.id,newAmountMinor:2500,reason:'Again mistake',operationId:id()}),/PAYMENT_NOT_CORRECTABLE/);
  const p2=payment(due.id,1000);await f.ops.recordPayment(teacher,p2);
  await f.ops.refundPayment(teacher,{id:id(),paymentId:p2.id,amountMinor:500,reason:'Duplicate tender',operationId:id()});
  await assert.rejects(()=>f.ops.correctPayment(teacher,{id:id(),paymentId:p2.id,newAmountMinor:900,reason:'After refund',operationId:id()}),/PAYMENT_NOT_CORRECTABLE/);
});

test('positive correction may not exceed outstanding; op id conflict cannot replay another action',async()=>{
  const {f,due}=await setup();const p=payment(due.id,8000);await f.ops.recordPayment(teacher,p);
  await assert.rejects(()=>f.ops.correctPayment(teacher,{id:id(),paymentId:p.id,newAmountMinor:10001,reason:'Incorrect total',operationId:id()}),/INVALID_CORRECTION_DELTA/);
  await assert.rejects(()=>f.ops.waiveDue(teacher,{id:id(),invoiceId:due.id,amountMinor:1,reason:'Small grant',operationId:p.operationId}),/OPERATION_ID_CONFLICT/);
  assert.equal(f.state().invoices[due.id].paidMinor,8000);
});

test('failed audit writes roll back payments, operations, and invoice totals atomically',async()=>{
  const f=mockPort({failAudit:'payment.posted'});const {due}=await setup(f);const p=payment(due.id);
  const before=f.state();
  await assert.rejects(()=>f.ops.recordPayment(teacher,p),/AUDIT_WRITE_FAILED/);
  assert.deepEqual(f.state(),before);
  assert.equal(Object.keys(f.state().payments).length,0);
});

test('student sees own payment records, IDOR and leaky provider outputs fail',async()=>{
  const {f}=await setup();
  assert.equal((await f.ops.listStudentPayments(student,studentId)).length,1);
  await assert.rejects(()=>f.ops.listStudentPayments(student,otherStudentId),/FORBIDDEN/);
  await assert.rejects(()=>f.ops.listStudentPayments(outsider,studentId),/FORBIDDEN/);
  const leak=mockPort({leakStudent:true});await setup(leak);
  await assert.rejects(()=>leak.ops.listStudentPayments(student,studentId),/PERSISTENCE_DATA_LEAK/);
});

test('reports enforce teacher access, batch ID, period bounds and pagination',async()=>{
  const {f}=await setup();
  assert.equal((await f.ops.batchFinanceReport(teacher,batchId,{period:'2026-10'})).length,1);
  await assert.rejects(()=>f.ops.batchFinanceReport(student,batchId),/FORBIDDEN/);
  await assert.rejects(()=>f.ops.batchFinanceReport(teacher,batchId,{period:'2026-77'}),/INVALID_REPORT_FILTER/);
  await assert.rejects(()=>f.ops.batchFinanceReport(teacher,batchId,{limit:999999}),/INVALID_PAGINATION/);
  const leak=mockPort({leakBatch:true});await setup(leak);
  await assert.rejects(()=>leak.ops.batchFinanceReport(teacher,batchId),/PERSISTENCE_DATA_LEAK/);
});

test('CSV export escapes formula injection, quotes, commas, control characters',async()=>{
  const {f}=await setup(mockPort({injection:'\t=HYPERLINK("malicious","click")'}));
  const csv=await f.ops.exportBatchPaymentsCsv(teacher,batchId);
  assert.match(csv,/"'\t=HYPERLINK\(""malicious"",""click""\)"/);
  assert.equal(safeCsvCell('hello,world'),'"hello,world"');
  assert.equal(safeCsvCell('=1+2'),'"\'=1+2"');
  assert.equal(safeCsvCell('  -10'),'"\'  -10"');
  await assert.rejects(()=>f.ops.exportBatchPaymentsCsv(student,batchId),/FORBIDDEN/);
});

test('audit events carry teacher identity and are teacher-only',async()=>{
  const {f}=await setup();const rows=await f.ops.listAudit(teacher);
  assert.equal(rows[0].actorId,teacherId);
  assert.equal(rows.length,2);
  await assert.rejects(()=>f.ops.listAudit(student),/FORBIDDEN/);
});

test('unknown authentication claims, missing transaction port, malformed money fail closed',async()=>{
  const ops=createFinanceOperations();
  await assert.rejects(()=>ops.recordPayment(teacher,payment(id())),/PERSISTENCE_PORT_UNAVAILABLE/);
  await assert.rejects(()=>ops.recordPayment({...teacher,verified:false},payment(id())),/UNAUTHENTICATED/);
  await assert.rejects(()=>ops.recordPayment(teacher,{...payment(id()),amountMinor:0}),/INVALID_PAYMENT/);
  await assert.rejects(()=>ops.recordPayment(teacher,{...payment(id()),amountMinor:10.25}),/INVALID_PAYMENT/);
  await assert.rejects(()=>ops.generateMonthlyDues(teacher,{planId:id(),operationId:'bad'}),/INVALID_OPERATION_ID/);
});
