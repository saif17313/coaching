import test from 'node:test';
import assert from 'node:assert/strict';
import {transitionAccount,transitionEnrollment,normalizeStudentPatch,assertUniqueEnrollment,assertActivationCapacity,assertTeacherActor,assertStudentVisibleToActor,decideEnrollmentWithPort} from '../src/server/domain/student-operations.mjs';
const uuid='7d1e2a31-f404-4a32-a03b-91e234a44d90';
const teacher={id:uuid,role:'teacher',verified:true};
test('account transitions allow disable/reactivate but reject unapproved activation paths',()=>{
 assert.equal(transitionAccount('active','disabled'),'disabled');assert.equal(transitionAccount('disabled','active'),'active');
 assert.throws(()=>transitionAccount('rejected','active'),/INVALID_ACCOUNT_TRANSITION/);
});
test('enrollment transitions prohibit terminal reactivation',()=>{
 assert.equal(transitionEnrollment('pending','active'),'active');assert.throws(()=>transitionEnrollment('rejected','active'),/INVALID_ENROLLMENT_TRANSITION/);
});
test('student patch trims safe fields and prohibits role/status escalation',()=>{
 assert.deepEqual(normalizeStudentPatch({fullName:'  Ayesha Rahman  '}),{fullName:'Ayesha Rahman'});
 assert.throws(()=>normalizeStudentPatch({role:'teacher'}),/UNSUPPORTED_STUDENT_FIELD/);
 assert.throws(()=>normalizeStudentPatch({guardianPhone:'bad'}),/INVALID_PHONE/);
});
test('duplicate active or pending enrollment blocked',()=>{
 assert.throws(()=>assertUniqueEnrollment([{studentId:'a',batchId:'b',status:'active'}],'a','b'),/DUPLICATE_ENROLLMENT/);
 assert.equal(assertUniqueEnrollment([{studentId:'a',batchId:'b',status:'cancelled'}],'a','b'),true);
});
test('capacity checks reject full batch and invalid counters',()=>{
 assert.equal(assertActivationCapacity({capacity:20,activeCount:19,currentStatus:'pending'}),true);
 assert.throws(()=>assertActivationCapacity({capacity:20,activeCount:20,currentStatus:'pending'}),/BATCH_FULL/);
 assert.throws(()=>assertActivationCapacity({capacity:20,activeCount:1.5,currentStatus:'pending'}),/INVALID_CAPACITY/);
});
test('verified actor required, student object ID access enforced',()=>{
 assert.equal(assertTeacherActor(teacher),teacher);
 assert.throws(()=>assertTeacherActor({...teacher,verified:false}),/FORBIDDEN/);
 assert.equal(assertStudentVisibleToActor({id:'A',role:'student',verified:true},'A'),true);
 assert.throws(()=>assertStudentVisibleToActor({id:'A',role:'student',verified:true},'B'),/FORBIDDEN/);
});
test('writes fail closed without port; injected port receives only verified commands',async()=>{
 await assert.rejects(decideEnrollmentWithPort(undefined,teacher,{enrollmentId:uuid,decision:'approve'}),/TRANSACTION_PORT_UNAVAILABLE/);
 let called=0;
 const port={decideEnrollmentAtomic:async(_actor,cmd)=>{called++;return {status:cmd.decision};}};
 assert.deepEqual(await decideEnrollmentWithPort(port,teacher,{enrollmentId:uuid,decision:'approve'}),{status:'approve'});
 assert.equal(called,1);
 await assert.rejects(decideEnrollmentWithPort(port,{...teacher,verified:false},{enrollmentId:uuid,decision:'approve'}),/FORBIDDEN/);
 assert.equal(called,1);
});
