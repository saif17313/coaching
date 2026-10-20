import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeTeacherList,readTeacherList,teacherCommand} from '../src/client/teacher-management.mjs';
const student='11111111-1111-4111-8111-111111111111',batch='22222222-2222-4222-8222-222222222222',enrollment='33333333-3333-4333-8333-333333333333';
const receipt='44444444-4444-4444-8444-444444444444';
const respond=(data,status=200)=>new Response(JSON.stringify(status===200||status===201?{success:true,data}:{success:false,error:{code:'SERVICE_UNAVAILABLE'}}),{status,headers:{'content-type':'application/json'}});
async function captureRead(kind,opts){let call;
 const result=await readTeacherList(kind,opts,(path,init)=>{call={path,init};return Promise.resolve(respond([]));});return {call,result};}
test('all three teacher list screens use exact existing read routes and bounded params',async()=>{
 const s=(await captureRead('students',{offset:20,filter:'active'})).call;
 assert.equal(s.path,'/api/v1/teacher/students/directory?limit=20&offset=20&accountStatus=active');
 const b=(await captureRead('batches',{offset:0})).call;
 assert.equal(b.path,'/api/v1/teacher/batches?limit=20&offset=0');
 const e=(await captureRead('enrollments',{offset:0,filter:'pending'})).call;
 assert.equal(e.path,'/api/v1/teacher/enrollments?limit=20&offset=0&status=pending');
 assert.equal(e.init.credentials,'same-origin');
 for(const [scope,options] of [['students',{offset:-1}],['students',{offset:7}],['batches',{filter:'active'}],['enrollments',{filter:'disabled'}],['students',{offset:10020}]]){
  assert.throws(()=>readTeacherList(scope,options,()=>{throw Error('SHOULD_NOT_REQUEST')}));
 }
});
test('all six management actions keep JWT in HttpOnly cookie, require new operation receipt and CSRF marker',async()=>{
 const fixtures=[
  ['createBatch',{code:'HSC_01',name:'Math',capacity:25},null,'POST','/api/v1/teacher/batch-commands'],
  ['updateBatch',{capacity:26},batch,'PATCH',`/api/v1/teacher/batch-commands/${batch}`],
  ['renameStudent',{fullName:'Student One'},student,'PATCH',`/api/v1/teacher/students/${student}/profile`],
  ['changeStudentStatus',{status:'active'},student,'PATCH',`/api/v1/teacher/students/${student}/status`],
  ['requestEnrollment',{studentId:student,batchId:batch},null,'POST','/api/v1/teacher/enrollment-requests'],
  ['decideEnrollment',{decision:'approve'},enrollment,'POST',`/api/v1/teacher/enrollments/${enrollment}/decision`]
 ];
 for(const [kind,input,id,method,path] of fixtures){
  let call; const value=await teacherCommand(kind,{id,input},(u,init)=>{call={u,init};return Promise.resolve(respond({id}));},()=>receipt);
  assert.deepEqual(value,{id});assert.equal(call.u,path);assert.equal(call.init.method,method);
  assert.equal(call.init.headers['Idempotency-Key'],receipt);assert.equal(call.init.headers['x-musa-ui'],'1');assert.equal(call.init.credentials,'same-origin');
  assert.equal(call.init.headers.Authorization,undefined);assert.equal(call.init.headers.Cookie,undefined);
 }
});
test('invalid payload and bad resource IDs cannot send a network request',async()=>{
 const bad=[
  ['createBatch',{code:'bad code',name:'Math',capacity:25}],
  ['createBatch',{code:'XX',name:'Math',capacity:0}],
  ['createBatch',{code:'XX',name:'Math',capacity:20,ownerId:student}],
  ['updateBatch',{role:'teacher'}],
  ['renameStudent',{fullName:' X '}],
  ['changeStudentStatus',{status:'teacher'}],
  ['requestEnrollment',{studentId:student,batchId:'bad'}],
  ['decideEnrollment',{decision:'delete'}],
 ];
 for(const [kind,input] of bad){
  assert.throws(()=>teacherCommand(kind,{id:student,input},()=>{throw Error('SHOULD_NOT_REQUEST')},()=>receipt));
 }
 assert.throws(()=>teacherCommand('updateBatch',{id:'bad',input:{capacity:22}},()=>{throw Error('SHOULD_NOT_REQUEST')},()=>receipt));
});
test('server errors are surfaced without leaking upstream content or pretending mutation success',async()=>{
 await assert.rejects(teacherCommand('createBatch',{input:{code:'SC_1',name:'Science',capacity:30}},()=>Promise.resolve(respond({secret:'db token'},503)),()=>receipt),/service is temporarily unavailable/);
});
test('management DTO normalization rejects duplicate, foreign and malformed projections',()=>{
 assert.deepEqual(normalizeTeacherList('students',{students:[{id:student,fullName:'A',accountStatus:'active'}]})[0],{id:student,name:'A',status:'active'});
 assert.equal(normalizeTeacherList('batches',[{id:batch,code:'MATH',name:'Mathematics',capacity:25,is_archived:false}])[0].archived,false);
 assert.equal(normalizeTeacherList('enrollments',[{id:enrollment,student_id:student,batch_id:batch,status:'pending'}])[0].batchId,batch);
 assert.throws(()=>normalizeTeacherList('students',{students:[{id:student,fullName:'A',accountStatus:'active'},{id:student,fullName:'B',accountStatus:'active'}]}),/Duplicate/);
 assert.throws(()=>normalizeTeacherList('enrollments',[{id:enrollment,student_id:'foreign',batch_id:batch,status:'pending'}]),/Invalid enrollment/);
 assert.throws(()=>normalizeTeacherList('batches',[{id:batch,code:'ABC',name:'Physics',capacity:'25',is_archived:false}]),/Invalid batch/);
});
test('portal replaces teacher generic data table only for operational screens',()=>{
 const portal=readFileSync(new URL('../src/components/portal/PortalClient.tsx',import.meta.url),'utf8');
 const code=readFileSync(new URL('../src/components/portal/TeacherManagement.tsx',import.meta.url),'utf8');
 assert.match(portal,/isTeacherManagement\?<TeacherManagement/);
 assert.match(portal,/isCms\|\|isStudentExperience\|\|isTeacherManagement/);
 assert.match(code,/window\.confirm/);
 assert.match(code,/changeStudentStatus/);
 assert.doesNotMatch(code,/service_role|localStorage|SUPABASE_SERVICE_ROLE/);
});
