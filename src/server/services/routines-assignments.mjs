/**
 * Offline Teacher Routine + Assignment orchestration.
 * Service actor MUST come from verified server auth. Production transaction ports must
 * re-check teacher scope/enrollment/row locks/uniqueness and append audits atomically.
 * No DB connection, HTTP endpoints, or credentials are shipped in this module.
 */
export class StudyError extends Error {
  constructor(code) { super(code); this.name = 'StudyError'; this.code = code; }
}
const fail = code => { throw new StudyError(code); };
const uuid = x => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
const shape = (x, allowed, required) => plain(x) && required.every(k => Object.hasOwn(x,k)) && Object.keys(x).every(k => allowed.includes(k));
const text = (s, min, max) => typeof s === 'string' && s.trim().length >= min && s.trim().length <= max;
const validTime = s => typeof s === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s) &&
  Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;
const clone = x => structuredClone(x);
const isInt = (n,min,max) => Number.isSafeInteger(n) && n >= min && n <= max;
function actorCheck(actor, role) {
  if (!plain(actor) || actor.verified !== true || !uuid(actor.id) || !['teacher','student'].includes(actor.role)) fail('UNAUTHENTICATED');
  if (role && actor.role !== role) fail('FORBIDDEN');
}
function method(port, name) { if (!port || typeof port[name] !== 'function') fail('PERSISTENCE_PORT_UNAVAILABLE'); }
function txMethod(tx, name) { if (!tx || typeof tx[name] !== 'function') fail('TRANSACTION_PORT_INCOMPLETE'); }
function page(q={}) { if (!shape(q,['limit','offset'],[])) fail('INVALID_QUERY'); const limit=q.limit??20,offset=q.offset??0; if (!isInt(limit,1,100)||!isInt(offset,0,1_000_000)) fail('INVALID_PAGINATION'); return {limit,offset}; }
function clock(options) { const d=(options.now??(()=>new Date()))(); if (!(d instanceof Date) || !Number.isFinite(d.getTime())) fail('INVALID_CLOCK'); return d; }
function slotValid(s) {
  if (!shape(s,['id','batchId','subjectId','dayOfWeek','startMinute','endMinute','room'],['id','batchId','subjectId','dayOfWeek','startMinute','endMinute']) ||
      !uuid(s.id)||!uuid(s.batchId)||!uuid(s.subjectId)||!isInt(s.dayOfWeek,0,6)||
      !isInt(s.startMinute,0,1439)||!isInt(s.endMinute,1,1440)||s.endMinute<=s.startMinute||
      (s.room!==undefined&&!text(s.room,1,100))) fail('INVALID_ROUTINE_SLOT');
  return {...s,room:s.room?.trim()??'',status:'active'};
}
function slotPatch(p) {
  if (!shape(p,['dayOfWeek','startMinute','endMinute','room','subjectId'],[]) || Object.keys(p).length===0 ||
      (Object.hasOwn(p,'dayOfWeek')&&!isInt(p.dayOfWeek,0,6)) ||
      (Object.hasOwn(p,'startMinute')&&!isInt(p.startMinute,0,1439)) ||
      (Object.hasOwn(p,'endMinute')&&!isInt(p.endMinute,1,1440)) ||
      (Object.hasOwn(p,'room')&&!text(p.room,1,100)) ||
      (Object.hasOwn(p,'subjectId')&&!uuid(p.subjectId))) fail('INVALID_SLOT_PATCH');
  return {...p,...(Object.hasOwn(p,'room')?{room:p.room.trim()}:{})};
}
function assignmentValid(a) {
  if (!shape(a,['id','batchId','subjectId','title','instructions','releaseAt','dueAt','maxPoints','allowResubmit'],['id','batchId','subjectId','title','instructions','releaseAt','dueAt','maxPoints']) ||
      !uuid(a.id)||!uuid(a.batchId)||!uuid(a.subjectId)||!text(a.title,2,160)||!text(a.instructions,2,20_000)||
      !validTime(a.releaseAt)||!validTime(a.dueAt)||Date.parse(a.dueAt)<=Date.parse(a.releaseAt)||
      !isInt(a.maxPoints,1,1000)||(a.allowResubmit!==undefined&&typeof a.allowResubmit!=='boolean')) fail('INVALID_ASSIGNMENT');
  return {...a,title:a.title.trim(),instructions:a.instructions.trim(),allowResubmit:a.allowResubmit??false,status:'draft',gradesPublished:false};
}
function assignmentPatch(p) {
  if (!shape(p,['title','instructions','releaseAt','dueAt','maxPoints','allowResubmit'],[])||Object.keys(p).length===0||
      (Object.hasOwn(p,'title')&&!text(p.title,2,160))||(Object.hasOwn(p,'instructions')&&!text(p.instructions,2,20_000))||
      (Object.hasOwn(p,'releaseAt')&&!validTime(p.releaseAt))||(Object.hasOwn(p,'dueAt')&&!validTime(p.dueAt))||
      (Object.hasOwn(p,'maxPoints')&&!isInt(p.maxPoints,1,1000))||
      (Object.hasOwn(p,'allowResubmit')&&typeof p.allowResubmit!=='boolean')) fail('INVALID_ASSIGNMENT_PATCH');
  return {...p,...(Object.hasOwn(p,'title')?{title:p.title.trim()}:{}),...(Object.hasOwn(p,'instructions')?{instructions:p.instructions.trim()}:{})};
}
function requireBatchId(batchId) { if (!uuid(batchId)) fail('INVALID_BATCH_ID'); }
function requireId(id) { if (!uuid(id)) fail('INVALID_ID'); }
async function authorizeBatch(port,actor,batchId) {
  if (actor.role==='teacher') { method(port,'assertTeacherManagesBatch'); await port.assertTeacherManagesBatch(actor.id,batchId); }
  else {method(port,'assertActiveEnrollment'); await port.assertActiveEnrollment(actor.id,batchId);}
}
async function managed(tx,actor,batchId) {txMethod(tx,'assertTeacherManagesBatch');await tx.assertTeacherManagesBatch(actor.id,batchId);}
async function audit(tx, actor, action, entityId) {txMethod(tx,'appendAudit');await tx.appendAudit({actorId:actor.id,action,entityId});}
function released(a,date) {return (a.status==='published'||a.status==='closed')&&Date.parse(a.releaseAt)<=date.getTime();}
export function slotsOverlap(a,b) {
  if (!plain(a)||!plain(b)||!isInt(a.startMinute,0,1439)||!isInt(b.startMinute,0,1439)||!isInt(a.endMinute,1,1440)||!isInt(b.endMinute,1,1440)||a.endMinute<=a.startMinute||b.endMinute<=b.startMinute||!isInt(a.dayOfWeek,0,6)||!isInt(b.dayOfWeek,0,6)) fail('INVALID_ROUTINE_SLOT');
  return a.batchId===b.batchId&&a.dayOfWeek===b.dayOfWeek&&a.startMinute<b.endMinute&&b.startMinute<a.endMinute;
}
export function createStudyOperations(port, options={}) {
  if (!shape(options,['now'],[]) || (options.now!==undefined&&typeof options.now!=='function')) fail('INVALID_OPTIONS');
  return Object.freeze({
    async createRoutineSlot(actor,input) {
      actorCheck(actor,'teacher');const slot=slotValid(input);method(port,'inTransaction');
      return port.inTransaction(async tx=>{
        await managed(tx,actor,slot.batchId);txMethod(tx,'assertSubjectInBatch');await tx.assertSubjectInBatch(slot.subjectId,slot.batchId);
        txMethod(tx,'assertRoutineSlotAvailable');await tx.assertRoutineSlotAvailable(slot,null);
        txMethod(tx,'insertRoutineSlot');const result=await tx.insertRoutineSlot(clone(slot));await audit(tx,actor,'routine.created',slot.id);return result;
      });
    },
    async updateRoutineSlot(actor,id,patch) {
      actorCheck(actor,'teacher');requireId(id);const changes=slotPatch(patch);method(port,'inTransaction');
      return port.inTransaction(async tx=>{
        txMethod(tx,'getRoutineSlotLocked');const current=await tx.getRoutineSlotLocked(id);if (!current) fail('ROUTINE_NOT_FOUND');
        await managed(tx,actor,current.batchId);if(current.status!=='active')fail('ROUTINE_ARCHIVED');
        const updated=slotValid({id:current.id,batchId:current.batchId,subjectId:changes.subjectId??current.subjectId,dayOfWeek:changes.dayOfWeek??current.dayOfWeek,startMinute:changes.startMinute??current.startMinute,endMinute:changes.endMinute??current.endMinute,room:changes.room??current.room});
        txMethod(tx,'assertSubjectInBatch');await tx.assertSubjectInBatch(updated.subjectId,updated.batchId);
        txMethod(tx,'assertRoutineSlotAvailable');await tx.assertRoutineSlotAvailable(updated,id);
        txMethod(tx,'updateRoutineSlot');const result=await tx.updateRoutineSlot(id,clone(updated));await audit(tx,actor,'routine.updated',id);return result;
      });
    },
    async archiveRoutineSlot(actor,id) {
      actorCheck(actor,'teacher');requireId(id);method(port,'inTransaction');
      return port.inTransaction(async tx=>{
        txMethod(tx,'getRoutineSlotLocked');const slot=await tx.getRoutineSlotLocked(id);if(!slot)fail('ROUTINE_NOT_FOUND');await managed(tx,actor,slot.batchId);if(slot.status!=='active')fail('ROUTINE_ARCHIVED');
        txMethod(tx,'archiveRoutineSlot');const result=await tx.archiveRoutineSlot(id);await audit(tx,actor,'routine.archived',id);return result;
      });
    },
    async listRoutine(actor,batchId,q={}) {
      actorCheck(actor);requireBatchId(batchId);const query=page(q);await authorizeBatch(port,actor,batchId);
      method(port,'listRoutineAuthorized');const rows=await port.listRoutineAuthorized(actor,batchId,query);
      if(!Array.isArray(rows)||rows.length>query.limit||rows.some(x=>!plain(x)||x.batchId!==batchId||(actor.role==='student'&&x.status!=='active')))fail('DATA_ACCESS_VIOLATION');return clone(rows);
    },
    async createAssignment(actor,input) {
      actorCheck(actor,'teacher');const a=assignmentValid(input);method(port,'inTransaction');
      return port.inTransaction(async tx=>{
        await managed(tx,actor,a.batchId);txMethod(tx,'assertSubjectInBatch');await tx.assertSubjectInBatch(a.subjectId,a.batchId);
        txMethod(tx,'insertAssignment');const result=await tx.insertAssignment(clone(a));await audit(tx,actor,'assignment.created',a.id);return result;
      });
    },
    async editAssignmentDraft(actor,id,patch) {
      actorCheck(actor,'teacher');requireId(id);const changes=assignmentPatch(patch);method(port,'inTransaction');
      return port.inTransaction(async tx=>{
        txMethod(tx,'getAssignmentLocked');const a=await tx.getAssignmentLocked(id);if(!a)fail('ASSIGNMENT_NOT_FOUND');await managed(tx,actor,a.batchId);if(a.status!=='draft')fail('ASSIGNMENT_NOT_DRAFT');
        const next=assignmentValid({id:a.id,batchId:a.batchId,subjectId:a.subjectId,title:changes.title??a.title,instructions:changes.instructions??a.instructions,releaseAt:changes.releaseAt??a.releaseAt,dueAt:changes.dueAt??a.dueAt,maxPoints:changes.maxPoints??a.maxPoints,allowResubmit:changes.allowResubmit??a.allowResubmit});
        txMethod(tx,'updateAssignmentDraft');const result=await tx.updateAssignmentDraft(id,clone(next));await audit(tx,actor,'assignment.updated',id);return result;
      });
    },
    async publishAssignment(actor,id) {
      actorCheck(actor,'teacher');requireId(id);method(port,'inTransaction');
      return port.inTransaction(async tx=>{
        txMethod(tx,'getAssignmentLocked');const a=await tx.getAssignmentLocked(id);if(!a)fail('ASSIGNMENT_NOT_FOUND');await managed(tx,actor,a.batchId);if(a.status!=='draft')fail('INVALID_ASSIGNMENT_TRANSITION');
        if(Date.parse(a.dueAt)<=clock(options).getTime())fail('ASSIGNMENT_DUE_IN_PAST');
        txMethod(tx,'setAssignmentStatus');const result=await tx.setAssignmentStatus(id,'published');await audit(tx,actor,'assignment.published',id);return result;
      });
    },
    async closeAssignment(actor,id) {
      actorCheck(actor,'teacher');requireId(id);method(port,'inTransaction');return port.inTransaction(async tx=>{
        txMethod(tx,'getAssignmentLocked');const a=await tx.getAssignmentLocked(id);if(!a)fail('ASSIGNMENT_NOT_FOUND');await managed(tx,actor,a.batchId);if(a.status!=='published')fail('INVALID_ASSIGNMENT_TRANSITION');
        txMethod(tx,'setAssignmentStatus');const result=await tx.setAssignmentStatus(id,'closed');await audit(tx,actor,'assignment.closed',id);return result;
      });
    },
    async listAssignments(actor,batchId,q={}) {
      actorCheck(actor);requireBatchId(batchId);const query=page(q);await authorizeBatch(port,actor,batchId);
      method(port,'listAssignmentsAuthorized');const rows=await port.listAssignmentsAuthorized(actor,batchId,query);
      const date=clock(options);if(!Array.isArray(rows)||rows.length>query.limit||rows.some(x=>!plain(x)||x.batchId!==batchId||(actor.role==='student'&&!released(x,date))))fail('DATA_ACCESS_VIOLATION');return clone(rows);
    },
    async submitAssignment(actor,input) {
      actorCheck(actor,'student');if(!shape(input,['id','assignmentId','answerText','attachmentId'],['id','assignmentId','answerText'])||!uuid(input.id)||!uuid(input.assignmentId)||!text(input.answerText,1,20_000)||(input.attachmentId!==undefined&&input.attachmentId!==null&&!uuid(input.attachmentId)))fail('INVALID_SUBMISSION');
      const date=clock(options);method(port,'inTransaction');return port.inTransaction(async tx=>{
        txMethod(tx,'getAssignmentLocked');const a=await tx.getAssignmentLocked(input.assignmentId);if(!a)fail('ASSIGNMENT_NOT_FOUND');
        txMethod(tx,'assertActiveEnrollment');await tx.assertActiveEnrollment(actor.id,a.batchId);
        if(!released(a,date)||date.getTime()>Date.parse(a.dueAt))fail('SUBMISSION_CLOSED');
        txMethod(tx,'getSubmissionLocked');const prev=await tx.getSubmissionLocked(a.id,actor.id);
        if(a.gradesPublished || (prev && (!a.allowResubmit||prev.gradeStatus!=='ungraded')))fail('RESUBMISSION_DENIED');
        txMethod(tx,'saveSubmission');const cmd={id:prev?.id??input.id,assignmentId:a.id,studentId:actor.id,answerText:input.answerText.trim(),attachmentId:input.attachmentId??null,submittedAt:date.toISOString(),gradeStatus:'ungraded'};
        const result=await tx.saveSubmission(clone(cmd),Boolean(prev));await audit(tx,actor,prev?'submission.resubmitted':'submission.created',cmd.id);return result;
      });
    },
    async gradeSubmission(actor,submissionId,points,feedback='') {
      actorCheck(actor,'teacher');requireId(submissionId);if(!isInt(points,0,1000)||!text(feedback,0,2000))fail('INVALID_GRADE');method(port,'inTransaction');
      return port.inTransaction(async tx=>{
        txMethod(tx,'getSubmissionForGradingLocked');const item=await tx.getSubmissionForGradingLocked(submissionId);if(!item)fail('SUBMISSION_NOT_FOUND');
        txMethod(tx,'getAssignmentLocked');const a=await tx.getAssignmentLocked(item.assignmentId);if(!a)fail('ASSIGNMENT_NOT_FOUND');await managed(tx,actor,a.batchId);
        if(a.status==='draft'||a.gradesPublished||points>a.maxPoints)fail('GRADE_NOT_ALLOWED');
        txMethod(tx,'saveGradeDraft');const result=await tx.saveGradeDraft(item.id,points,feedback.trim());await audit(tx,actor,'submission.graded',item.id);return result;
      });
    },
    async publishAssignmentGrades(actor,assignmentId) {
      actorCheck(actor,'teacher');requireId(assignmentId);method(port,'inTransaction');return port.inTransaction(async tx=>{
        txMethod(tx,'getAssignmentLocked');const a=await tx.getAssignmentLocked(assignmentId);if(!a)fail('ASSIGNMENT_NOT_FOUND');await managed(tx,actor,a.batchId);
        if(a.status==='draft'||a.gradesPublished)fail('GRADES_NOT_PUBLISHABLE');
        txMethod(tx,'publishGradesAtomic');const result=await tx.publishGradesAtomic(a.id);await audit(tx,actor,'assignment.grades_published',a.id);return result;
      });
    },
    async listMySubmissions(actor,assignmentId,q={}) {
      actorCheck(actor,'student');requireId(assignmentId);const query=page(q);method(port,'assertStudentCanViewSubmission');await port.assertStudentCanViewSubmission(actor.id,assignmentId);method(port,'listStudentSubmissionsAuthorized');const rows=await port.listStudentSubmissionsAuthorized(actor,assignmentId,query);
      if(!Array.isArray(rows)||rows.length>query.limit||rows.some(x=>!plain(x)||x.studentId!==actor.id||x.assignmentId!==assignmentId||x.gradeStatus==='draft'||(x.points!==undefined&&x.gradeStatus!=='published')))fail('DATA_ACCESS_VIOLATION');return clone(rows);
    }
  });
}
