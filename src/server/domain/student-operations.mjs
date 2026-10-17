// Pure operational invariants: no storage access, no simulated successful writes.
export class DomainError extends Error {
  constructor(code) { super(code); this.name='DomainError'; this.code=code; }
}
const deny = code => { throw new DomainError(code); };
export const ACCOUNT_STATES = Object.freeze(['pending','active','disabled','rejected']);
export const ENROLLMENT_STATES = Object.freeze(['pending','active','rejected','cancelled']);
const accountEdges = Object.freeze({pending:['active','rejected'],active:['disabled'],disabled:['active'],rejected:[]});
const enrollmentEdges = Object.freeze({pending:['active','rejected','cancelled'],active:['cancelled'],rejected:[],cancelled:[]});
export function transitionAccount(from,to) {
  if(!accountEdges[from]?.includes(to)) deny('INVALID_ACCOUNT_TRANSITION');
  return to;
}
export function transitionEnrollment(from,to) {
  if(!enrollmentEdges[from]?.includes(to)) deny('INVALID_ENROLLMENT_TRANSITION');
  return to;
}
export function normalizeStudentPatch(value) {
  if(!value || typeof value!=='object' || Array.isArray(value)) deny('INVALID_STUDENT_PATCH');
  const keys=Object.keys(value), allowed=new Set(['fullName','phone','guardianPhone']);
  if(!keys.length || keys.some(k=>!allowed.has(k))) deny('UNSUPPORTED_STUDENT_FIELD');
  const data={};
  for(const k of keys){
    const v=value[k];
    if(typeof v!=='string' || v.trim().length===0 || v.trim().length>(k==='fullName'?120:32)) deny('INVALID_STUDENT_FIELD');
    if(k!=='fullName' && !/^\+?[0-9 -]{7,32}$/.test(v.trim())) deny('INVALID_PHONE');
    data[k]=v.trim();
  }
  return Object.freeze(data);
}
export function assertUniqueEnrollment(existing, studentId, batchId) {
  if(!Array.isArray(existing)) deny('INVALID_ENROLLMENTS');
  if(existing.some(x=>x.studentId===studentId && x.batchId===batchId && (x.status==='pending'||x.status==='active'))) deny('DUPLICATE_ENROLLMENT');
  return true;
}
export function assertActivationCapacity({capacity,activeCount,currentStatus}) {
  if(!Number.isSafeInteger(capacity)||capacity<1||!Number.isSafeInteger(activeCount)||activeCount<0) deny('INVALID_CAPACITY');
  if(currentStatus!=='pending') deny('INVALID_ENROLLMENT_TRANSITION');
  if(activeCount>=capacity) deny('BATCH_FULL');
  return true;
}
export function assertTeacherActor(actor) {
  if(!actor || actor.verified!==true || actor.role!=='teacher' || typeof actor.id!=='string' || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(actor.id)) deny('FORBIDDEN');
  return actor;
}
export function assertStudentVisibleToActor(actor,studentId) {
  if(!actor || actor.verified!==true) deny('UNAUTHENTICATED');
  if(actor.role==='teacher') return true;
  if(actor.role==='student' && actor.id===studentId) return true;
  deny('FORBIDDEN');
}
// The transaction implementation must lock the batch and enrollment rows, re-evaluate
// capacity and statuses INSIDE the same transaction, and enforce DB-side authorization.
export async function decideEnrollmentWithPort(port,actor,command) {
  assertTeacherActor(actor);
  if(!port || typeof port.decideEnrollmentAtomic!=='function') deny('TRANSACTION_PORT_UNAVAILABLE');
  if(!command || !/^[0-9a-f-]{36}$/i.test(command.enrollmentId) || !['approve','reject','cancel'].includes(command.decision)) deny('INVALID_COMMAND');
  return port.decideEnrollmentAtomic(actor, Object.freeze({...command}));
}
