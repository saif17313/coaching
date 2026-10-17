import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createStudyOperations,slotsOverlap} from '../src/server/services/routines-assignments.mjs';
import {createStudentPortalOperations} from '../src/server/services/student-portal.mjs';
const id=randomUUID;
const [teacherId,studentId,otherId,batchId,otherBatchId,subjectId]=Array.from({length:6},id);
const teacher={id:teacherId,role:'teacher',verified:true};
const student={id:studentId,role:'student',verified:true};
const intruder={id:otherId,role:'teacher',verified:true};
const otherStudent={id:otherId,role:'student',verified:true};
const NOW='2026-10-16T08:00:00.000Z';
const later='2026-10-18T08:00:00.000Z';
const due='2026-10-22T08:00:00.000Z';
const copy=x=>structuredClone(x);
const slot=()=>({id:id(),batchId,subjectId,dayOfWeek:2,startMinute:540,endMinute:600,room:' Lab 1 '});
const assignment=()=>({id:id(),batchId,subjectId,title:' Homework 1 ',instructions:' Write a solution ',releaseAt:NOW,dueAt:due,maxPoints:100,allowResubmit:false});
function mock(options={}){
 let state={routines:{},assignments:{},submissions:{},audit:[]};
 let membership='active';
 let time=new Date(NOW);
 const inTx=async fn=>{
   const draft=copy(state);
   const tx={
     async assertTeacherManagesBatch(a,b){if(a!==teacherId||b!==batchId)throw Error('MANAGED_BATCH_DENIED');},
     async assertSubjectInBatch(s,b){if(s!==subjectId||b!==batchId)throw Error('SUBJECT_BATCH_MISMATCH');},
     async assertActiveEnrollment(a,b){if(a!==studentId||b!==batchId||membership!=='active')throw Error('ENROLLMENT_INACTIVE');},
     async assertRoutineSlotAvailable(item,exclude){if(Object.values(draft.routines).some(x=>x.id!==exclude&&x.batchId===item.batchId&&x.status==='active'&&slotsOverlap(x,item)))throw Error('ROUTINE_OVERLAP');},
     async insertRoutineSlot(item){if(draft.routines[item.id])throw Error('DUPLICATE_ROUTINE');draft.routines[item.id]=copy(item);return copy(item);},
     async getRoutineSlotLocked(id){return copy(draft.routines[id]??null);},
     async updateRoutineSlot(id,item){draft.routines[id]=copy(item);return copy(item);},
     async archiveRoutineSlot(id){draft.routines[id].status='archived';return copy(draft.routines[id]);},
     async insertAssignment(item){if(draft.assignments[item.id])throw Error('DUPLICATE_ASSIGNMENT');draft.assignments[item.id]=copy(item);return copy(item);},
     async getAssignmentLocked(id){return copy(draft.assignments[id]??null);},
     async updateAssignmentDraft(id,item){draft.assignments[id]=copy(item);return copy(item);},
     async setAssignmentStatus(id,status){draft.assignments[id].status=status;return copy(draft.assignments[id]);},
     async getSubmissionLocked(a,s){return copy(Object.values(draft.submissions).find(x=>x.assignmentId===a&&x.studentId===s)??null);},
     async saveSubmission(item,resubmission){if(resubmission&&!draft.submissions[item.id])throw Error('SUBMISSION_MISSING');if(!resubmission&&draft.submissions[item.id])throw Error('DUPLICATE_SUBMISSION');draft.submissions[item.id]=copy(item);return copy(item);},
     async getSubmissionForGradingLocked(s){return copy(draft.submissions[s]??null);},
     async saveGradeDraft(s,points,feedback){draft.submissions[s].gradeStatus='draft';draft.submissions[s].points=points;draft.submissions[s].feedback=feedback;return copy(draft.submissions[s]);},
     async publishGradesAtomic(a){let n=0;for(const item of Object.values(draft.submissions)){if(item.assignmentId===a&&item.gradeStatus==='draft'){item.gradeStatus='published';n++;}}draft.assignments[a].gradesPublished=true;return {published:n};},
     async appendAudit(record){draft.audit.push(copy(record));if(options.failAudit===record.action)throw Error('AUDIT_FAIL');}
   };
   const result=await fn(tx);state=draft;return copy(result);
 };
 const port={
   inTransaction:inTx,
   async assertTeacherManagesBatch(a,b){if(a!==teacherId||b!==batchId)throw Error('MANAGED_BATCH_DENIED');},
   async assertActiveEnrollment(a,b){if(a!==studentId||b!==batchId||membership!=='active')throw Error('ENROLLMENT_INACTIVE');},
   async listRoutineAuthorized(actor,b,q){const rows=Object.values(state.routines).filter(x=>x.batchId===b&&(actor.role==='teacher'||x.status==='active'));if(options.leakRoutine)rows.push({...rows[0],batchId:otherBatchId});return copy(rows.slice(q.offset,q.offset+q.limit));},
   async listAssignmentsAuthorized(actor,b,q){const rows=Object.values(state.assignments).filter(x=>x.batchId===b&&(actor.role==='teacher'||x.status!=='draft'));if(options.leakAssignment)rows.push({...rows[0],status:'draft'});return copy(rows.slice(q.offset,q.offset+q.limit));},
   async assertStudentCanViewSubmission(actor,a){if(actor!==studentId||membership!=='active'||!state.assignments[a]||state.assignments[a].status==='draft')throw Error('SUBMISSION_ACCESS_DENIED');},
   async listStudentSubmissionsAuthorized(actor,a,q){const rows=Object.values(state.submissions).filter(x=>x.assignmentId===a&&x.studentId===actor.id).map(x=>x.gradeStatus==='published'?x:(()=>{const safe=copy(x);delete safe.points;delete safe.feedback;safe.gradeStatus='ungraded';return safe;})());if(options.leakSubmission)rows.push({...rows[0],studentId:otherId});return copy(rows.slice(q.offset,q.offset+q.limit));},
   async assertStudentActive(a){if(a!==studentId||membership!=='active')throw Error('ACCOUNT_NOT_ACTIVE');},
   async getDashboardSnapshotAuthorized(actor,q){const data={accountStatus:'active',summary:{activeBatches:1,pendingAssignments:0,unreadCount:1},batches:[{id:batchId,studentId:actor,enrollmentStatus:'active'}],upcomingClasses:[],assignments:[],unreadNotifications:[{id:id(),recipientId:actor,readAt:null}]};
     if(options.leakDashboard)data.unreadNotifications[0].recipientId=otherId;
     if(options.leakDraft)data.assignments.push({batchId,studentId:actor,enrollmentStatus:'active',authorizedForStudent:true,status:'draft',released:false});
     if(options.leakBatch)data.batches[0].enrollmentStatus='pending';
     return copy({...data,batches:data.batches.slice(0,q.limit)});
   }
 };
 return {ops:createStudyOperations(port,{now:()=>time}),portal:createStudentPortalOperations(port),state:()=>copy(state),setTime:s=>{time=new Date(s);},setMembership:x=>{membership=x;},port};
}

test('routine creates with subject/batch relationship, teacher scope and audit',async()=>{
 const x=mock(), s=slot();await assert.rejects(()=>x.ops.createRoutineSlot(student,s),/FORBIDDEN/);
 await assert.rejects(()=>x.ops.createRoutineSlot(intruder,s),/MANAGED_BATCH_DENIED/);
 await assert.rejects(()=>x.ops.createRoutineSlot(teacher,{...s,subjectId:otherId}),/SUBJECT_BATCH_MISMATCH/);
 const r=await x.ops.createRoutineSlot(teacher,s);assert.equal(r.room,'Lab 1');assert.equal(x.state().audit.length,1);
});
test('routine overlap blocks conflicting slot; adjacent slots allowed',async()=>{
 const x=mock(),first=slot();await x.ops.createRoutineSlot(teacher,first);
 await assert.rejects(()=>x.ops.createRoutineSlot(teacher,{...slot(),startMinute:599,endMinute:650}),/ROUTINE_OVERLAP/);
 await x.ops.createRoutineSlot(teacher,{...slot(),startMinute:600,endMinute:650});assert.equal(Object.keys(x.state().routines).length,2);
 assert.equal(slotsOverlap(first,{...first,startMinute:600,endMinute:620}),false);
 assert.equal(slotsOverlap(first,{...first,batchId:otherBatchId}),false);
});
test('routine update detects overlapping windows, validates malformed time and archives',async()=>{
 const x=mock(),a=slot(),b={...slot(),startMinute:600,endMinute:650};await x.ops.createRoutineSlot(teacher,a);await x.ops.createRoutineSlot(teacher,b);
 await assert.rejects(()=>x.ops.updateRoutineSlot(teacher,b.id,{startMinute:590}),/ROUTINE_OVERLAP/);
 await assert.rejects(()=>x.ops.createRoutineSlot(teacher,{...slot(),endMinute:540}),/INVALID_ROUTINE_SLOT/);
 assert.equal((await x.ops.updateRoutineSlot(teacher,b.id,{startMinute:660,endMinute:700})).startMinute,660);
 await x.ops.archiveRoutineSlot(teacher,a.id);await assert.rejects(()=>x.ops.archiveRoutineSlot(teacher,a.id),/ROUTINE_ARCHIVED/);
 assert.equal((await x.ops.listRoutine(student,batchId)).length,1);
});
test('inactive member cannot read routine; adapter leak rejected',async()=>{
 const x=mock({leakRoutine:true}),s=slot();await x.ops.createRoutineSlot(teacher,s);
 await assert.rejects(()=>x.ops.listRoutine(student,batchId),/DATA_ACCESS_VIOLATION/);
 x.setMembership('cancelled');await assert.rejects(()=>x.ops.listRoutine(student,batchId),/ENROLLMENT_INACTIVE/);
 await assert.rejects(()=>x.ops.listRoutine(otherStudent,batchId),/ENROLLMENT_INACTIVE/);
});
test('assignment drafts validate release/due/subject and remain hidden',async()=>{
 const x=mock(),a=assignment();await assert.rejects(()=>x.ops.createAssignment(student,a),/FORBIDDEN/);
 await assert.rejects(()=>x.ops.createAssignment(teacher,{...a,maxPoints:0}),/INVALID_ASSIGNMENT/);
 await assert.rejects(()=>x.ops.createAssignment(teacher,{...a,releaseAt:due}),/INVALID_ASSIGNMENT/);
 await assert.rejects(()=>x.ops.createAssignment(teacher,{...a,subjectId:otherId}),/SUBJECT_BATCH_MISMATCH/);
 const draft=await x.ops.createAssignment(teacher,a);assert.equal(draft.status,'draft');assert.deepEqual(await x.ops.listAssignments(student,batchId),[]);
});
test('assignment draft edit, publish, and publish-only-once',async()=>{
 const x=mock(),a=assignment();await x.ops.createAssignment(teacher,a);
 await x.ops.editAssignmentDraft(teacher,a.id,{title:' New homework ',maxPoints:50});assert.equal(x.state().assignments[a.id].maxPoints,50);
 await x.ops.publishAssignment(teacher,a.id);const rows=await x.ops.listAssignments(student,batchId);assert.equal(rows[0].title,'New homework');
 await assert.rejects(()=>x.ops.editAssignmentDraft(teacher,a.id,{title:'no'}),/ASSIGNMENT_NOT_DRAFT/);
 await assert.rejects(()=>x.ops.publishAssignment(teacher,a.id),/INVALID_ASSIGNMENT_TRANSITION/);
 await x.ops.closeAssignment(teacher,a.id);await assert.rejects(()=>x.ops.closeAssignment(teacher,a.id),/INVALID_ASSIGNMENT_TRANSITION/);
});
test('future release hides student view; due-in-past rejects publish',async()=>{
 const x=mock(),a={...assignment(),releaseAt:later};await x.ops.createAssignment(teacher,a);await x.ops.publishAssignment(teacher,a.id);
 await assert.rejects(()=>x.ops.listAssignments(student,batchId),/DATA_ACCESS_VIOLATION/);
 x.setTime(later);assert.equal((await x.ops.listAssignments(student,batchId)).length,1);
 const y=mock(),old={...assignment(),dueAt:'2026-10-14T08:00:00.000Z',releaseAt:'2026-10-12T08:00:00.000Z'};
 await y.ops.createAssignment(teacher,old);await assert.rejects(()=>y.ops.publishAssignment(teacher,old.id),/ASSIGNMENT_DUE_IN_PAST/);
});
test('student submission requires active membership, release and before deadline',async()=>{
 const x=mock(),a=assignment();await x.ops.createAssignment(teacher,a);const input={id:id(),assignmentId:a.id,answerText:' Solution '};
 await assert.rejects(()=>x.ops.submitAssignment(student,input),/SUBMISSION_CLOSED/);
 await x.ops.publishAssignment(teacher,a.id);x.setMembership('pending');await assert.rejects(()=>x.ops.submitAssignment(student,input),/ENROLLMENT_INACTIVE/);
 x.setMembership('active');const row=await x.ops.submitAssignment(student,input);assert.equal(row.answerText,'Solution');assert.equal(row.studentId,studentId);
 await assert.rejects(()=>x.ops.submitAssignment(student,{...input,id:id()}),/RESUBMISSION_DENIED/);
 x.setTime('2026-10-23T08:00:00.000Z');await assert.rejects(()=>x.ops.submitAssignment(student,{...input,id:id()}),/SUBMISSION_CLOSED/);
});
test('resubmit accepted only when enabled and ungraded, submission ID is stable',async()=>{
 const x=mock(),a={...assignment(),allowResubmit:true};await x.ops.createAssignment(teacher,a);await x.ops.publishAssignment(teacher,a.id);
 const first=await x.ops.submitAssignment(student,{id:id(),assignmentId:a.id,answerText:'first'});
 const second=await x.ops.submitAssignment(student,{id:id(),assignmentId:a.id,answerText:'second'});
 assert.equal(first.id,second.id);assert.equal(second.answerText,'second');assert.equal(Object.keys(x.state().submissions).length,1);
 await x.ops.gradeSubmission(teacher,first.id,88,'good');
 await assert.rejects(()=>x.ops.submitAssignment(student,{id:id(),assignmentId:a.id,answerText:'third'}),/RESUBMISSION_DENIED/);
});
test('grade bounds, draft privacy, publish grades, cannot retroactively regrade',async()=>{
 const x=mock(),a=assignment();await x.ops.createAssignment(teacher,a);await x.ops.publishAssignment(teacher,a.id);
 const row=await x.ops.submitAssignment(student,{id:id(),assignmentId:a.id,answerText:'my answer'});
 await assert.rejects(()=>x.ops.gradeSubmission(student,row.id,80,'hi'),/FORBIDDEN/);
 await assert.rejects(()=>x.ops.gradeSubmission(teacher,row.id,101,'good'),/GRADE_NOT_ALLOWED/);
 await x.ops.gradeSubmission(teacher,row.id,90,' good ');
 const before=await x.ops.listMySubmissions(student,a.id);assert.equal(before[0].points,undefined);
 assert.deepEqual(await x.ops.publishAssignmentGrades(teacher,a.id),{published:1});
 const after=await x.ops.listMySubmissions(student,a.id);assert.equal(after[0].points,90);
 x.setMembership('cancelled');await assert.rejects(()=>x.ops.listMySubmissions(student,a.id),/SUBMISSION_ACCESS_DENIED/);x.setMembership('active');
 await assert.rejects(()=>x.ops.gradeSubmission(teacher,row.id,50,'bad'),/GRADE_NOT_ALLOWED/);
 await assert.rejects(()=>x.ops.publishAssignmentGrades(teacher,a.id),/GRADES_NOT_PUBLISHABLE/);
});
test('failed audit rolls back routine and assignment writes',async()=>{
 const x=mock({failAudit:'routine.created'});await assert.rejects(()=>x.ops.createRoutineSlot(teacher,slot()),/AUDIT_FAIL/);
 assert.equal(Object.keys(x.state().routines).length,0);assert.equal(x.state().audit.length,0);
 const y=mock({failAudit:'submission.created'}),a=assignment();await y.ops.createAssignment(teacher,a);await y.ops.publishAssignment(teacher,a.id);
 await assert.rejects(()=>y.ops.submitAssignment(student,{id:id(),assignmentId:a.id,answerText:'attempt'}),/AUDIT_FAIL/);
 assert.equal(Object.keys(y.state().submissions).length,0);
});
test('fail closed absent port, malformed actor and leaky assignment port',async()=>{
 const empty=createStudyOperations();await assert.rejects(()=>empty.createRoutineSlot(teacher,slot()),/PERSISTENCE_PORT_UNAVAILABLE/);
 await assert.rejects(()=>empty.listRoutine(student,batchId),/PERSISTENCE_PORT_UNAVAILABLE/);
 const x=mock({leakAssignment:true}),a=assignment();await x.ops.createAssignment(teacher,a);await x.ops.publishAssignment(teacher,a.id);
 await assert.rejects(()=>x.ops.listAssignments(student,batchId),/DATA_ACCESS_VIOLATION/);
 await assert.rejects(()=>x.ops.listAssignments({...student,verified:false},batchId),/UNAUTHENTICATED/);
 await assert.rejects(()=>x.ops.listAssignments(student,batchId,{limit:1000}),/INVALID_PAGINATION/);
});
test('student submission read rejects cross-user records and draft grade leakage',async()=>{
 const x=mock({leakSubmission:true}),a=assignment();await x.ops.createAssignment(teacher,a);await x.ops.publishAssignment(teacher,a.id);
 await x.ops.submitAssignment(student,{id:id(),assignmentId:a.id,answerText:'my answer'});
 await assert.rejects(()=>x.ops.listMySubmissions(student,a.id),/DATA_ACCESS_VIOLATION/);
 await assert.rejects(()=>x.ops.listMySubmissions(otherStudent,a.id),/SUBMISSION_ACCESS_DENIED/);
});
test('dashboard read validates owner, active status, pending visibility and paging',async()=>{
 const x=mock();const view=await x.portal.getDashboard(student);assert.equal(view.summary.activeBatches,1);
 await assert.rejects(()=>x.portal.getDashboard(teacher),/UNAUTHENTICATED/);
 await assert.rejects(()=>x.portal.getDashboard(student,{limit:30}),/INVALID_QUERY/);
 x.setMembership('pending');await assert.rejects(()=>x.portal.getDashboard(student),/ACCOUNT_NOT_ACTIVE/);
 for(const config of [{leakDashboard:true},{leakBatch:true},{leakDraft:true}]){
   const y=mock(config);await assert.rejects(()=>y.portal.getDashboard(student),/DATA_ACCESS_VIOLATION/);
 }
 await assert.rejects(()=>createStudentPortalOperations().getDashboard(student),/PERSISTENCE_PORT_UNAVAILABLE/);
});
