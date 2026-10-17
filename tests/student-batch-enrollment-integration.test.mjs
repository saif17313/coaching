import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoachingOperations,accountTransition,enrollmentTransition} from '../src/server/services/student-batch-enrollment.mjs';
const ids=['14c84641-793d-4559-a73d-2bf92be70101','14c84641-793d-4559-a73d-2bf92be70102','14c84641-793d-4559-a73d-2bf92be70103','14c84641-793d-4559-a73d-2bf92be70104'];
const [tid,sid,bid,eid]=ids;
const teacher={id:tid,role:'teacher',verified:true}, student={id:sid,role:'student',verified:true};
function mockStore(){
 const students=new Map(),batches=new Map(),enrollments=new Map();
 let audits=[];
 // TEST-ONLY store: simulates atomic commits by cloning state and replacing it on success.
 function tx(fn){const s=new Map([...students].map(([k,v])=>[k,structuredClone(v)]));const b=new Map([...batches].map(([k,v])=>[k,structuredClone(v)]));const e=new Map([...enrollments].map(([k,v])=>[k,structuredClone(v)]));const events=[];const out=fn(s,b,e,events);students.clear();batches.clear();enrollments.clear();for(const [k,v] of s)students.set(k,v);for(const [k,v] of b)batches.set(k,v);for(const [k,v] of e)enrollments.set(k,v);audits.push(...events);return structuredClone(out);}
 const need=(m,id)=>{const x=m.get(id);if(!x)throw Error('NOT_FOUND');return x;};
 const port={
  createStudentAtomic:async(a,v)=>tx((s,b,e,ev)=>{if(s.has(v.id))throw Error('CONFLICT');s.set(v.id,v);ev.push('student.created');return v;}),
  listStudents:async(a,q)=>[...students.values()].slice(q.offset,q.offset+q.limit),
  getStudent:async(a,id)=>structuredClone(need(students,id)),
  updateStudentAtomic:async(a,id,patch)=>tx((s,b,e,ev)=>{const v=need(s,id);Object.assign(v,patch);ev.push('student.updated');return v;}),
  changeStudentStatusAtomic:async(a,c)=>tx((s,b,e,ev)=>{const v=need(s,c.studentId);v.status=accountTransition(v.status,c.status);ev.push('student.status');return v;}),
  createBatchAtomic:async(a,v)=>tx((s,b,e,ev)=>{if([...b.values()].some(x=>x.code===v.code))throw Error('DUPLICATE_CODE');b.set(v.id,{...v,isArchived:false});ev.push('batch.created');return b.get(v.id);}),
  updateBatchAtomic:async(a,id,patch)=>tx((s,b,e,ev)=>{const v=need(b,id);const active=[...e.values()].filter(x=>x.batchId===id&&x.status==='active').length;if(patch.capacity!==undefined&&patch.capacity<active)throw Error('CAPACITY_BELOW_ACTIVE');Object.assign(v,patch);ev.push('batch.updated');return v;}),
  listBatches:async(a,q)=>[...batches.values()].slice(q.offset,q.offset+q.limit),
  requestEnrollmentAtomic:async(a,v)=>tx((s,b,e,ev)=>{const st=need(s,v.studentId),batch=need(b,v.batchId);if(st.status!=='active'||batch.isArchived)throw Error('NOT_ELIGIBLE');if([...e.values()].some(x=>x.batchId===v.batchId&&x.studentId===v.studentId&&['active','pending'].includes(x.status)))throw Error('DUPLICATE_ENROLLMENT');const entry={...v,status:'pending'};e.set(v.id,entry);ev.push('enrollment.requested');return entry;}),
  decideEnrollmentAtomic:async(a,c)=>tx((s,b,e,ev)=>{const v=need(e,c.enrollmentId),batch=need(b,v.batchId),st=need(s,v.studentId);if(v.status!=='pending')throw Error('INVALID_ENROLLMENT_TRANSITION');if(c.decision==='approve'&&(st.status!=='active'||batch.isArchived))throw Error('NOT_ELIGIBLE');if(c.decision==='approve'&&[...e.values()].filter(x=>x.batchId===batch.id&&x.status==='active').length>=batch.capacity)throw Error('BATCH_FULL');v.status=enrollmentTransition(v.status,({approve:'active',reject:'rejected',cancel:'cancelled'})[c.decision]);ev.push('enrollment.decided');return v;}),
  listEnrollments:async(a,id)=>[...enrollments.values()].filter(x=>x.studentId===id).map(x=>structuredClone(x)),
 };
 return {port,audit:()=>[...audits],state:()=>({students:students.size,batches:batches.size,enrollments:enrollments.size})};
}
test('teacher student lifecycle, own profile patch and list; unauthorized changes denied',async()=>{
 const m=mockStore(),svc=createCoachingOperations(m.port);await assert.rejects(svc.createStudent(student,{id:sid,fullName:'Ayesha Khan'}),/FORBIDDEN/);
 await svc.createStudent(teacher,{id:sid,fullName:' Ayesha Khan '});assert.equal((await svc.listStudents(teacher)).length,1);
 await assert.rejects(svc.listStudents(student),/FORBIDDEN/);
 await svc.updateStudent(student,sid,{fullName:' Ayesha Rahman '});assert.equal((await svc.getStudent(student,sid)).fullName,'Ayesha Rahman');
 await assert.rejects(svc.updateStudent(student,sid,{role:'teacher'}),/UNSUPPORTED_STUDENT_FIELD/);
 await svc.changeStudentStatus(teacher,sid,'active');assert.equal((await svc.getStudent(student,sid)).status,'active');
 await assert.rejects(svc.changeStudentStatus(student,sid,'disabled'),/FORBIDDEN/);
 await assert.rejects(svc.getStudent({...student,id:bid},sid),/FORBIDDEN/);
});
test('batch creation, archive and bounded pagination with authorization',async()=>{
 const m=mockStore(),svc=createCoachingOperations(m.port);await assert.rejects(svc.createBatch(student,{id:bid,code:'B-01',name:'Physics',capacity:2}),/FORBIDDEN/);
 await svc.createBatch(teacher,{id:bid,code:'B-01',name:'Physics',capacity:2});assert.equal((await svc.listBatches(student)).length,1);
 await assert.rejects(svc.listBatches(student,{limit:100000}),/INVALID_PAGINATION/);
 await assert.rejects(svc.updateBatch(teacher,bid,{capacity:0}),/INVALID_BATCH_PATCH/);
 assert.equal((await svc.updateBatch(teacher,bid,{isArchived:true})).isArchived,true);
});
test('enrollment approve/reject, duplicate/capacity, rollback and immutable audit',async()=>{
 const m=mockStore(),svc=createCoachingOperations(m.port);await svc.createStudent(teacher,{id:sid,fullName:'Ayesha Khan'});await svc.changeStudentStatus(teacher,sid,'active');
 await svc.createBatch(teacher,{id:bid,code:'B-01',name:'Physics',capacity:1});
 await svc.requestEnrollment(student,{id:eid,studentId:sid,batchId:bid});
 const before=m.audit().length;await assert.rejects(svc.requestEnrollment(student,{id:ids[0],studentId:sid,batchId:bid}),/DUPLICATE_ENROLLMENT/);
 assert.equal(m.audit().length,before);assert.equal(m.state().enrollments,1);
 await assert.rejects(svc.decideEnrollment(student,eid,'approve'),/FORBIDDEN/);
 assert.equal((await svc.decideEnrollment(teacher,eid,'approve')).status,'active');
 await assert.rejects(svc.decideEnrollment(teacher,eid,'approve'),/INVALID_ENROLLMENT_TRANSITION/);
 await assert.rejects(svc.updateBatch(teacher,bid,{capacity:0}),/INVALID_BATCH_PATCH/);
 assert.equal((await svc.listEnrollments(student,sid)).length,1);
 await assert.rejects(svc.listEnrollments({...student,id:ids[0]},sid),/FORBIDDEN/);
});
test('service refuses all writes without persistence port and invalid actors',async()=>{
 const svc=createCoachingOperations();await assert.rejects(svc.createStudent(teacher,{id:sid,fullName:'Ayesha Khan'}),/PERSISTENCE_PORT_UNAVAILABLE/);
 await assert.rejects(svc.changeStudentStatus(teacher,sid,'active'),/PERSISTENCE_PORT_UNAVAILABLE/);
 await assert.rejects(svc.requestEnrollment(student,{id:eid,studentId:sid,batchId:bid}),/PERSISTENCE_PORT_UNAVAILABLE/);
 await assert.rejects(svc.createBatch({...teacher,verified:false},{id:bid,code:'B-01',name:'Physics',capacity:1}),/UNAUTHENTICATED/);
});
