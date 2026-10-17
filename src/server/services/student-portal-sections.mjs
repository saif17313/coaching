/**
 * Student Portal route-facing read operations (offline implementation).
 * A production port MUST verify auth.uid(), active account, active batch
 * enrollment and section release at the database boundary for EVERY call.
 * Caller-supplied actor.verified is never sufficient for real authentication.
 * No port/auth adapter/HTTP route is wired by this package.
 */
export class StudentSectionError extends Error {
  constructor(code) { super(code); this.name = 'StudentSectionError'; this.code = code; }
}
const fail = code => { throw new StudentSectionError(code); };
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const exact = (v, fields) => plain(v) && Object.keys(v).length === fields.length && fields.every(k => Object.hasOwn(v, k)) && Object.keys(v).every(k => fields.includes(k));
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const safeInt = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
const safeText = (v, max = 200) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const iso = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v) && Number.isFinite(Date.parse(v));
const copy = v => structuredClone(v);
const needs = (p, k) => { if (!p || typeof p[k] !== 'function') fail('PERSISTENCE_PORT_UNAVAILABLE'); };
function student(actor) { if (!plain(actor) || actor.verified !== true || actor.role !== 'student' || !uuid(actor.id)) fail('UNAUTHENTICATED'); }
function query(q) {
  if (!plain(q) || Object.keys(q).some(k => !['limit', 'offset'].includes(k))) fail('INVALID_QUERY');
  const limit = q.limit ?? 10, offset = q.offset ?? 0;
  if (!safeInt(limit, 1, 25) || !safeInt(offset, 0, 1000000)) fail('INVALID_QUERY');
  return { limit, offset };
}
const sectionNames = Object.freeze(['materials','announcements','exams','results','payments','assignments','routine','notifications']);
const common = ['id','studentId','batchId','title'];
const schemas = Object.freeze({
  materials: [...common,'status','releasedAt'],
  announcements: [...common,'status','releasedAt','body'],
  exams: [...common,'status','scheduledAt','maxMarks'],
  results: [...common,'status','examId','marks','maxMarks','rank'],
  payments: [...common,'invoiceId','period','currency','totalMinor','paidMinor','waivedMinor','refundedMinor','outstandingMinor'],
  assignments: [...common,'status','releasedAt','dueAt'],
  routine: [...common,'status','weekday','startMinute','endMinute'],
  notifications: ['id','studentId','title','body','createdAt','readAt'],
});
function validateRow(row, kind, studentId, batchId, now) {
  if (!exact(row, schemas[kind]) || !uuid(row.id) || row.studentId !== studentId || !safeText(row.title)) fail('DATA_ACCESS_VIOLATION');
  if (kind !== 'notifications' && row.batchId !== batchId) fail('DATA_ACCESS_VIOLATION');
  if (kind === 'materials' || kind === 'announcements' || kind === 'assignments') {
    if (row.status !== 'published' || !iso(row.releasedAt) || Date.parse(row.releasedAt) > now) fail('DATA_ACCESS_VIOLATION');
    if (kind === 'announcements' && (typeof row.body !== 'string' || row.body.length > 6000)) fail('DATA_ACCESS_VIOLATION');
    if (kind === 'assignments' && (!iso(row.dueAt) || Date.parse(row.dueAt) <= Date.parse(row.releasedAt))) fail('DATA_ACCESS_VIOLATION');
  }
  if (kind === 'exams' && (row.status !== 'published' || !iso(row.scheduledAt) || !safeInt(row.maxMarks, 1, 100000))) fail('DATA_ACCESS_VIOLATION');
  if (kind === 'results' && (row.status !== 'published' || !uuid(row.examId) || typeof row.marks !== 'number' || !Number.isFinite(row.marks) || row.marks < 0 || !safeInt(row.maxMarks, 1, 100000) || row.marks > row.maxMarks || !safeInt(row.rank, 1, 1000000))) fail('DATA_ACCESS_VIOLATION');
  if (kind === 'payments') {
    if (!uuid(row.invoiceId) || row.currency !== 'BDT' || typeof row.period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.period)) fail('DATA_ACCESS_VIOLATION');
    if (!['totalMinor','paidMinor','waivedMinor','refundedMinor','outstandingMinor'].every(k => safeInt(row[k], 0, 100000000000))) fail('DATA_ACCESS_VIOLATION');
    if (row.refundedMinor > row.paidMinor || row.paidMinor + row.waivedMinor - row.refundedMinor > row.totalMinor || row.totalMinor - row.paidMinor - row.waivedMinor + row.refundedMinor !== row.outstandingMinor) fail('DATA_ACCESS_VIOLATION');
  }
  if (kind === 'routine' && (row.status !== 'active' || !safeInt(row.weekday, 0, 6) || !safeInt(row.startMinute, 0, 1439) || !safeInt(row.endMinute, 1, 1440) || row.endMinute <= row.startMinute)) fail('DATA_ACCESS_VIOLATION');
  if (kind === 'notifications' && (typeof row.body !== 'string' || row.body.length > 2000 || !iso(row.createdAt) || (row.readAt !== null && !iso(row.readAt)))) fail('DATA_ACCESS_VIOLATION');
}
/** The port accepts ONLY server-computed owner and membership identifiers. */
export function createStudentSectionOperations(port, options = {}) {
  const clock = options.now ?? (() => Date.now());
  if (typeof clock !== 'function' || Object.keys(options).some(k => k !== 'now')) fail('INVALID_OPTIONS');
  async function active(actor) { student(actor); needs(port,'assertStudentActive'); await port.assertStudentActive(actor.id); }
  async function membership(actor, batchId) { if (!uuid(batchId)) fail('INVALID_BATCH_ID'); needs(port,'assertActiveEnrollment'); await port.assertActiveEnrollment(actor.id, batchId); }
  return Object.freeze({
    async getMyProfile(actor) {
      await active(actor); needs(port, 'getStudentProfileAuthorized');
      const row = await port.getStudentProfileAuthorized(actor.id);
      if (!exact(row,['id','fullName','studentCode','phone','accountStatus']) || row.id !== actor.id || row.accountStatus !== 'active' || !safeText(row.fullName,120) || !safeText(row.studentCode,24) || (row.phone !== null && !safeText(row.phone,32))) fail('DATA_ACCESS_VIOLATION');
      return copy(row);
    },
    async listMyBatches(actor, q = {}) {
      await active(actor); const page = query(q); needs(port, 'listStudentBatchesAuthorized');
      const rows = await port.listStudentBatchesAuthorized(actor.id, page);
      if (!Array.isArray(rows) || rows.length > page.limit) fail('DATA_ACCESS_VIOLATION');
      const ids = new Set();
      for (const row of rows) {
        if (!exact(row,['id','studentId','name','code','enrollmentStatus']) || !uuid(row.id) || row.studentId !== actor.id || row.enrollmentStatus !== 'active' || !safeText(row.name,120) || !safeText(row.code,24) || ids.has(row.id)) fail('DATA_ACCESS_VIOLATION');
        ids.add(row.id);
      }
      return copy(rows);
    },
    async getMyBatchOverview(actor, batchId) {
      await active(actor); await membership(actor,batchId); needs(port,'getStudentBatchOverviewAuthorized');
      const row = await port.getStudentBatchOverviewAuthorized(actor.id,batchId);
      if (!exact(row,['id','studentId','name','code','enrollmentStatus','subjectCount','activeAssignments','unreadAnnouncements']) || row.id !== batchId || row.studentId !== actor.id || row.enrollmentStatus !== 'active' || !safeText(row.name,120) || !safeText(row.code,24) || !['subjectCount','activeAssignments','unreadAnnouncements'].every(k => safeInt(row[k],0,100000))) fail('DATA_ACCESS_VIOLATION');
      return copy(row);
    },
    async listMyBatchSection(actor,batchId,kind,q = {}) {
      await active(actor); if (!sectionNames.includes(kind)) fail('INVALID_SECTION');
      if (kind !== 'notifications') await membership(actor,batchId);
      else if (batchId !== null) fail('INVALID_BATCH_ID');
      const page = query(q); needs(port,'listStudentSectionAuthorized');
      const rows = await port.listStudentSectionAuthorized(actor.id,kind,batchId,page);
      if (!Array.isArray(rows) || rows.length > page.limit) fail('DATA_ACCESS_VIOLATION');
      const now = clock(); if (!Number.isFinite(now) || now < 0) fail('INVALID_CLOCK');
      const ids = new Set();
      for (const row of rows) { validateRow(row,kind,actor.id,batchId,now); if (ids.has(row.id)) fail('DATA_ACCESS_VIOLATION'); ids.add(row.id); }
      return copy(rows);
    },
    async requestPasswordOrMfaChange(actor) {
      student(actor);
      // Auth reauthentication is mandatory. Never perform generic profile writes.
      fail('AUTH_REAUTH_INTEGRATION_REQUIRED');
    }
  });
}
export const studentSectionKinds = sectionNames;
