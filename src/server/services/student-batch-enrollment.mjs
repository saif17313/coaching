import { DomainError, normalizeStudentPatch, transitionAccount, transitionEnrollment } from '../domain/student-operations.mjs';

const fail = code => { throw new DomainError(code); };
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const validName = v => typeof v === 'string' && v.trim().length >= 2 && v.trim().length <= 120;
const validCode = v => typeof v === 'string' && /^[A-Z0-9][A-Z0-9_-]{1,23}$/.test(v);
const accountStates = new Set(['pending','active','disabled','rejected']);
function actorCheck(actor, teacher=false) {
  if (!actor || actor.verified !== true || !uuid(actor.id) || !['student','teacher'].includes(actor.role)) fail('UNAUTHENTICATED');
  if (teacher && actor.role !== 'teacher') fail('FORBIDDEN');
}
function requirePort(port, method) { if (!port || typeof port[method] !== 'function') fail('PERSISTENCE_PORT_UNAVAILABLE'); }
function ownOrTeacher(actor, studentId) { actorCheck(actor); if (actor.role !== 'teacher' && actor.id !== studentId) fail('FORBIDDEN'); }
const clone = v => structuredClone(v);

// All persistence authorization, concurrency locks, consistency checks and audit log writes
// MUST be repeated by the eventual DB/RLS/transaction implementation. The port is trusted
// ONLY after that adapter has been reviewed and integrated. No real adapter is shipped.
export function createCoachingOperations(port) {
  return Object.freeze({
    async createStudent(actor, input) {
      actorCheck(actor,true);requirePort(port,'createStudentAtomic');
      if (!input || !uuid(input.id) || !validName(input.fullName) || !accountStates.has(input.status ?? 'pending') || (input.status ?? 'pending') !== 'pending') fail('INVALID_STUDENT');
      if (Object.keys(input).some(k=>!['id','fullName','status'].includes(k))) fail('INVALID_STUDENT');
      return port.createStudentAtomic(actor,clone({id:input.id,fullName:input.fullName.trim(),status:'pending'}));
    },
    async listStudents(actor, query={}) {
      actorCheck(actor,true);requirePort(port,'listStudents');
      const limit=query.limit ?? 20, offset=query.offset ?? 0;
      if (!Number.isSafeInteger(limit) || limit<1 || limit>100 || !Number.isSafeInteger(offset) || offset<0) fail('INVALID_PAGINATION');
      if (Object.keys(query).some(k=>!['limit','offset'].includes(k))) fail('INVALID_QUERY');
      return port.listStudents(actor,{limit,offset});
    },
    async getStudent(actor,id) {
      if (!uuid(id)) fail('INVALID_STUDENT_ID'); ownOrTeacher(actor,id);requirePort(port,'getStudent');
      return port.getStudent(actor,id);
    },
    async updateStudent(actor,id,patch) {
      if (!uuid(id)) fail('INVALID_STUDENT_ID'); ownOrTeacher(actor,id);requirePort(port,'updateStudentAtomic');
      return port.updateStudentAtomic(actor,id,normalizeStudentPatch(patch));
    },
    async changeStudentStatus(actor,id,status) {
      actorCheck(actor,true);requirePort(port,'changeStudentStatusAtomic');
      if (!uuid(id) || !accountStates.has(status)) fail('INVALID_STATUS_COMMAND');
      return port.changeStudentStatusAtomic(actor,{studentId:id,status});
    },
    async createBatch(actor,input) {
      actorCheck(actor,true);requirePort(port,'createBatchAtomic');
      if (!input || !uuid(input.id) || !validCode(input.code) || !validName(input.name) || !Number.isSafeInteger(input.capacity) || input.capacity<1 || input.capacity>100000 || Object.keys(input).some(k=>!['id','code','name','capacity'].includes(k))) fail('INVALID_BATCH');
      return port.createBatchAtomic(actor,clone({...input,name:input.name.trim()}));
    },
    async updateBatch(actor,id,patch) {
      actorCheck(actor,true);requirePort(port,'updateBatchAtomic');
      if(!uuid(id)||!patch||!Object.keys(patch).length||Object.keys(patch).some(k=>!['name','capacity','isArchived'].includes(k))) fail('INVALID_BATCH_PATCH');
      if('name' in patch&&!validName(patch.name))fail('INVALID_BATCH_PATCH');
      if('capacity' in patch&&(!Number.isSafeInteger(patch.capacity)||patch.capacity<1||patch.capacity>100000))fail('INVALID_BATCH_PATCH');
      if('isArchived' in patch&&typeof patch.isArchived!=='boolean')fail('INVALID_BATCH_PATCH');
      return port.updateBatchAtomic(actor,id,clone(patch));
    },
    async listBatches(actor,query={}) {
      actorCheck(actor);requirePort(port,'listBatches');
      if(Object.keys(query).some(k=>!['limit','offset'].includes(k)))fail('INVALID_QUERY');
      const limit=query.limit??20,offset=query.offset??0;
      if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0)fail('INVALID_PAGINATION');
      return port.listBatches(actor,{limit,offset});
    },
    async requestEnrollment(actor, input) {
      actorCheck(actor);requirePort(port,'requestEnrollmentAtomic');
      if(!input||!uuid(input.id)||!uuid(input.studentId)||!uuid(input.batchId)||Object.keys(input).some(k=>!['id','studentId','batchId'].includes(k)))fail('INVALID_ENROLLMENT');
      if(actor.role==='student'&&actor.id!==input.studentId)fail('FORBIDDEN');
      return port.requestEnrollmentAtomic(actor,clone(input));
    },
    async decideEnrollment(actor,id,decision) {
      actorCheck(actor,true);requirePort(port,'decideEnrollmentAtomic');
      if(!uuid(id)||!['approve','reject','cancel'].includes(decision))fail('INVALID_ENROLLMENT_COMMAND');
      return port.decideEnrollmentAtomic(actor,{enrollmentId:id,decision});
    },
    async listEnrollments(actor,studentId) {
      ownOrTeacher(actor,studentId);requirePort(port,'listEnrollments');
      if(!uuid(studentId))fail('INVALID_STUDENT_ID');
      return port.listEnrollments(actor,studentId);
    },
  });
}
export const accountTransition = transitionAccount;
export const enrollmentTransition = transitionEnrollment;
