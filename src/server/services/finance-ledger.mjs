/**
 * Offline finance orchestration: BDT minor units (paisa), no floats or direct persistence.
 * Production adapters MUST independently enforce auth, active enrollment, row locks,
 * idempotent command claims, append-only accounting, atomic audit, and RLS.
 */
export class FinanceError extends Error {
  constructor(code) { super(code); this.name = 'FinanceError'; this.code = code; }
}
const fail = code => { throw new FinanceError(code); };
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys, required = []) => object(value) && required.every(k => Object.hasOwn(value,k)) && Object.keys(value).every(k => keys.includes(k));
const money = value => Number.isSafeInteger(value) && value > 0 && value <= 100_000_000_000;
const text = (value, low, high) => typeof value === 'string' && value.trim().length >= low && value.trim().length <= high;
const period = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const validDay = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value;
};
const deep = value => structuredClone(value);
const checkActor = (actor, teacher = false) => {
  if (!object(actor) || actor.verified !== true || !uuid(actor.id) || !['teacher','student'].includes(actor.role)) fail('UNAUTHENTICATED');
  if (teacher && actor.role !== 'teacher') fail('FORBIDDEN');
};
const checkPort = (port,name) => { if (!port || typeof port[name] !== 'function') fail('PERSISTENCE_PORT_UNAVAILABLE'); };
const txMethod = (tx,name) => { if (!tx || typeof tx[name] !== 'function') fail('TRANSACTION_PORT_INCOMPLETE'); };
const page = q => {
  if (!exact(q,['limit','offset'])) fail('INVALID_QUERY');
  const limit = q.limit ?? 50, offset = q.offset ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200 || !Number.isSafeInteger(offset) || offset < 0) fail('INVALID_PAGINATION');
  return {limit,offset};
};
const command = input => { if (!uuid(input.operationId)) fail('INVALID_OPERATION_ID'); };
const requireBalance = v => {
  if (!object(v) || !uuid(v.id) || !uuid(v.studentId) || !uuid(v.batchId) || !uuid(v.planId) ||
      !money(v.amountMinor) || !Number.isSafeInteger(v.paidMinor) || !Number.isSafeInteger(v.waivedMinor) ||
      !Number.isSafeInteger(v.refundedMinor) || !Number.isSafeInteger(v.correctedMinor) ||
      v.paidMinor < 0 || v.waivedMinor < 0 || v.refundedMinor < 0 ||
      v.refundedMinor > v.paidMinor || v.status !== 'open') fail('INVALID_INVOICE_STATE');
  const remaining = v.amountMinor - v.paidMinor - v.correctedMinor - v.waivedMinor + v.refundedMinor;
  if (!Number.isSafeInteger(remaining) || remaining < 0 || remaining > 100_000_000_000) fail('INVALID_INVOICE_BALANCE');
  return remaining;
};
const getInvoice = async (tx, actor, id) => {
  txMethod(tx,'getInvoiceLocked');
  const invoice = await tx.getInvoiceLocked(actor.id,id);
  if (!invoice || invoice.id !== id) fail('INVOICE_NOT_FOUND');
  return {invoice, remaining:requireBalance(invoice)};
};
async function atomic(port, actor, action, target, operationId, callback) {
  checkPort(port,'inTransaction');
  return port.inTransaction(async tx => {
    for (const name of ['claimOperation','appendAudit','completeOperation']) txMethod(tx,name);
    const saved = await tx.claimOperation(operationId,action,target,actor.id);
    if (saved !== null && saved !== undefined) return deep(saved);
    const result = await callback(tx);
    await tx.appendAudit({actorId:actor.id,action,entityId:target,operationId});
    await tx.completeOperation(operationId,deep(result));
    return deep(result);
  });
}

// Spreadsheet applications interpret a leading =,+,-,@, TAB, CR or LF as a formula.
// Prefix a single quote for risky content; then escape CSV double quotes.
export function safeCsvCell(value) {
  if (typeof value !== 'string' && typeof value !== 'number' && value !== null && value !== undefined) fail('INVALID_CSV_VALUE');
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[\s\uFEFF\u200B]*[=+\-@]/u.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"','""') + '"';
}
export function calculateInvoiceOutstanding(invoice) { return requireBalance(invoice); }
export function validateFeePlan(input) {
  if (!exact(input,['id','batchId','period','amountMinor','dueOn','label'],['id','batchId','period','amountMinor','dueOn','label']) ||
      !uuid(input.id) || !uuid(input.batchId) || !period(input.period) || !money(input.amountMinor) ||
      !validDay(input.dueOn) || input.dueOn.slice(0,7) < input.period || !text(input.label,2,120)) fail('INVALID_FEE_PLAN');
  return {...input,label:input.label.trim(),currency:'BDT'};
}
export function createFinanceOperations(port) {
  return Object.freeze({
    async createFeePlan(actor,input) {
      checkActor(actor,true);
      const value = validateFeePlan(input);
      checkPort(port,'inTransaction');
      return port.inTransaction(async tx => {
        txMethod(tx,'assertTeacherManagesBatch');txMethod(tx,'insertFeePlan');txMethod(tx,'appendAudit');
        await tx.assertTeacherManagesBatch(actor.id,value.batchId);
        const result=await tx.insertFeePlan(deep(value),actor.id);
        await tx.appendAudit({actorId:actor.id,action:'fee_plan.created',entityId:value.id});
        return deep(result);
      });
    },
    async generateMonthlyDues(actor,input) {
      checkActor(actor,true);
      if (!exact(input,['planId','operationId'],['planId','operationId']) || !uuid(input.planId)) fail('INVALID_DUE_COMMAND');
      command(input);
      return atomic(port,actor,'dues.generated',input.planId,input.operationId,async tx => {
        txMethod(tx,'getFeePlanLocked');txMethod(tx,'assertTeacherManagesBatch');txMethod(tx,'createDuesForActiveEnrollments');
        const plan=await tx.getFeePlanLocked(input.planId);
        if (!plan || plan.id!==input.planId || !uuid(plan.batchId) || !money(plan.amountMinor)) fail('FEE_PLAN_NOT_FOUND');
        await tx.assertTeacherManagesBatch(actor.id,plan.batchId);
        const result=await tx.createDuesForActiveEnrollments(plan,actor.id);
        if (!object(result) || !Number.isSafeInteger(result.created) || result.created<0) fail('INVALID_DUE_GENERATION_RESULT');
        return result;
      });
    },
    async recordPayment(actor,input) {
      checkActor(actor,true);
      if (!exact(input,['id','invoiceId','studentId','amountMinor','method','reference','operationId'],['id','invoiceId','studentId','amountMinor','method','operationId']) ||
          !uuid(input.id) || !uuid(input.invoiceId) || !uuid(input.studentId) || !money(input.amountMinor) ||
          !['cash','bank','mobile_banking'].includes(input.method) ||
          (input.reference!==undefined && !text(input.reference,1,120))) fail('INVALID_PAYMENT');
      command(input);
      return atomic(port,actor,'payment.posted',input.invoiceId,input.operationId,async tx => {
        txMethod(tx,'assertTeacherManagesBatch');txMethod(tx,'insertPayment');
        const {invoice,remaining}=await getInvoice(tx,actor,input.invoiceId);
        await tx.assertTeacherManagesBatch(actor.id,invoice.batchId);
        if (invoice.studentId!==input.studentId) fail('PAYMENT_RELATIONSHIP_MISMATCH');
        if (input.amountMinor>remaining) fail('PAYMENT_EXCEEDS_OUTSTANDING');
        const record={id:input.id,invoiceId:input.invoiceId,studentId:input.studentId,amountMinor:input.amountMinor,method:input.method,reference:input.reference?.trim()??'',operationId:input.operationId};
        return tx.insertPayment(deep(record),actor.id);
      });
    },
    async waiveDue(actor,input) {
      checkActor(actor,true);
      if (!exact(input,['id','invoiceId','amountMinor','reason','operationId'],['id','invoiceId','amountMinor','reason','operationId']) ||
          !uuid(input.id) || !uuid(input.invoiceId) || !money(input.amountMinor) || !text(input.reason,5,500)) fail('INVALID_WAIVER');
      command(input);
      return atomic(port,actor,'payment.waived',input.invoiceId,input.operationId,async tx => {
        txMethod(tx,'assertTeacherManagesBatch');txMethod(tx,'insertAdjustment');
        const {invoice,remaining}=await getInvoice(tx,actor,input.invoiceId);
        await tx.assertTeacherManagesBatch(actor.id,invoice.batchId);
        if (input.amountMinor>remaining) fail('WAIVER_EXCEEDS_OUTSTANDING');
        return tx.insertAdjustment({id:input.id,invoiceId:input.invoiceId,paymentId:null,kind:'waiver',amountMinor:input.amountMinor,reason:input.reason.trim(),operationId:input.operationId},actor.id);
      });
    },
    async refundPayment(actor,input) {
      checkActor(actor,true);
      if (!exact(input,['id','paymentId','amountMinor','reason','operationId'],['id','paymentId','amountMinor','reason','operationId']) ||
          !uuid(input.id) || !uuid(input.paymentId) || !money(input.amountMinor) || !text(input.reason,5,500)) fail('INVALID_REFUND');
      command(input);
      return atomic(port,actor,'payment.refunded',input.paymentId,input.operationId,async tx => {
        txMethod(tx,'getPaymentLocked');txMethod(tx,'assertTeacherManagesBatch');txMethod(tx,'insertAdjustment');
        const payment=await tx.getPaymentLocked(actor.id,input.paymentId);
        if (!payment || payment.id!==input.paymentId || !uuid(payment.invoiceId) || !money(payment.amountMinor) ||
            !Number.isSafeInteger(payment.refundedMinor) || payment.refundedMinor<0) fail('PAYMENT_NOT_FOUND');
        const {invoice}=await getInvoice(tx,actor,payment.invoiceId);
        if (payment.studentId!==invoice.studentId) fail('PAYMENT_RELATIONSHIP_MISMATCH');
        await tx.assertTeacherManagesBatch(actor.id,invoice.batchId);
        if (input.amountMinor > payment.amountMinor-payment.refundedMinor || payment.corrected) fail('REFUND_EXCEEDS_PAYMENT');
        return tx.insertAdjustment({id:input.id,invoiceId:invoice.id,paymentId:payment.id,kind:'refund',amountMinor:input.amountMinor,reason:input.reason.trim(),operationId:input.operationId},actor.id);
      });
    },
    async correctPayment(actor,input) {
      checkActor(actor,true);
      if (!exact(input,['id','paymentId','newAmountMinor','reason','operationId'],['id','paymentId','newAmountMinor','reason','operationId']) ||
          !uuid(input.id) || !uuid(input.paymentId) || !money(input.newAmountMinor) || !text(input.reason,5,500)) fail('INVALID_CORRECTION');
      command(input);
      return atomic(port,actor,'payment.corrected',input.paymentId,input.operationId,async tx => {
        txMethod(tx,'getPaymentLocked');txMethod(tx,'assertTeacherManagesBatch');txMethod(tx,'insertAdjustment');
        const payment=await tx.getPaymentLocked(actor.id,input.paymentId);
        if (!payment || payment.id!==input.paymentId || !money(payment.amountMinor) || !uuid(payment.invoiceId) || payment.corrected || payment.refundedMinor!==0) fail('PAYMENT_NOT_CORRECTABLE');
        const {invoice,remaining}=await getInvoice(tx,actor,payment.invoiceId);
        await tx.assertTeacherManagesBatch(actor.id,invoice.batchId);
        if (payment.studentId!==invoice.studentId) fail('PAYMENT_RELATIONSHIP_MISMATCH');
        const delta = input.newAmountMinor-payment.amountMinor;
        if (delta===0 || !Number.isSafeInteger(delta) || delta>remaining) fail('INVALID_CORRECTION_DELTA');
        return tx.insertAdjustment({id:input.id,invoiceId:invoice.id,paymentId:payment.id,kind:'correction',amountMinor:delta,reason:input.reason.trim(),operationId:input.operationId},actor.id);
      });
    },
    async listStudentPayments(actor,studentId,q={}) {
      checkActor(actor);
      if (!uuid(studentId)) fail('INVALID_STUDENT_ID');
      if (actor.role==='student' && actor.id!==studentId) fail('FORBIDDEN');
      checkPort(port,'listStudentPaymentsAuthorized');
      const rows=await port.listStudentPaymentsAuthorized(actor,studentId,page(q));
      if (!Array.isArray(rows) || rows.some(r=>!object(r)||r.studentId!==studentId)) fail('PERSISTENCE_DATA_LEAK');
      return deep(rows);
    },
    async batchFinanceReport(actor,batchId,filter={}) {
      checkActor(actor,true);
      if (!uuid(batchId) || !exact(filter,['period','limit','offset']) || (filter.period!==undefined&&!period(filter.period))) fail('INVALID_REPORT_FILTER');
      checkPort(port,'getBatchFinanceReportAuthorized');
      const rows=await port.getBatchFinanceReportAuthorized(actor,batchId,{...page({limit:filter.limit,offset:filter.offset}),...(filter.period?{period:filter.period}:{})});
      if (!Array.isArray(rows) || rows.some(r=>!object(r)||r.batchId!==batchId || !uuid(r.studentId) || !Number.isSafeInteger(r.amountMinor) || !Number.isSafeInteger(r.outstandingMinor) || r.outstandingMinor<0)) fail('PERSISTENCE_DATA_LEAK');
      return deep(rows);
    },
    async exportBatchPaymentsCsv(actor,batchId,filter={}) {
      const rows=await this.batchFinanceReport(actor,batchId,filter);
      const header=['Student ID','Reference','Period','Billed (paisa)','Outstanding (paisa)'];
      const data=rows.map(r=>[r.studentId,r.reference??'',r.period??'',r.amountMinor,r.outstandingMinor]);
      return [header,...data].map(row=>row.map(safeCsvCell).join(',')).join('\r\n')+'\r\n';
    },
    async listAudit(actor,q={}) {
      checkActor(actor,true);checkPort(port,'listFinancialAuditAuthorized');
      const rows=await port.listFinancialAuditAuthorized(actor,page(q));
      if (!Array.isArray(rows) || rows.some(r=>!object(r)||!uuid(r.actorId)||!text(r.action,3,120))) fail('INVALID_AUDIT_RESULT');
      return deep(rows);
    }
  });
}
