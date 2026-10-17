import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudentSectionOperations, studentSectionKinds} from '../src/server/services/student-portal-sections.mjs';

const sid='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const bid='33333333-3333-4333-8333-333333333333';
const eid='44444444-4444-4444-8444-444444444444';
const id='55555555-5555-4555-8555-555555555555';
const actor={id:sid,role:'student',verified:true};
const teacher={id:sid,role:'teacher',verified:true};
const release='2026-10-15T08:00:00Z';
const future='2026-10-20T08:00:00Z';
const clock=()=>Date.parse('2026-10-16T04:00:00Z');
const rows={
 materials:{id,studentId:sid,batchId:bid,title:'Chapter one',status:'published',releasedAt:release},
 announcements:{id,studentId:sid,batchId:bid,title:'Class update',body:'Room 2',status:'published',releasedAt:release},
 exams:{id,studentId:sid,batchId:bid,title:'Term exam',status:'published',scheduledAt:future,maxMarks:100},
 results:{id,studentId:sid,batchId:bid,title:'Term result',status:'published',examId:eid,marks:80,maxMarks:100,rank:4},
 payments:{id,studentId:sid,batchId:bid,title:'October fee',invoiceId:eid,currency:'BDT',period:'2026-10',totalMinor:100000,paidMinor:55000,waivedMinor:5000,refundedMinor:0,outstandingMinor:40000},
 assignments:{id,studentId:sid,batchId:bid,title:'Homework',status:'published',releasedAt:release,dueAt:future},
 routine:{id,studentId:sid,batchId:bid,title:'Math class',status:'active',weekday:1,startMinute:540,endMinute:600},
 notifications:{id,studentId:sid,title:'Alert',body:'Reminder',createdAt:release,readAt:null}
};
const clone=x=>structuredClone(x);
function fixture(overrides={}){
 const calls=[];
 const port={
  async assertStudentActive(studentId){calls.push(['active',studentId]);},
  async assertActiveEnrollment(studentId,batchId){calls.push(['enrolled',studentId,batchId]);},
  async getStudentProfileAuthorized(studentId){calls.push(['profile',studentId]);return {id:sid,fullName:'Student One',studentCode:'STD100',phone:null,accountStatus:'active'};},
  async listStudentBatchesAuthorized(studentId,page){calls.push(['batches',studentId,page]);return [{id:bid,studentId:sid,name:'Science 11',code:'S11',enrollmentStatus:'active'}];},
  async getStudentBatchOverviewAuthorized(studentId,batchId){calls.push(['batch',studentId,batchId]);return {id:bid,studentId:sid,name:'Science 11',code:'S11',enrollmentStatus:'active',subjectCount:4,activeAssignments:1,unreadAnnouncements:2};},
  async listStudentSectionAuthorized(studentId,kind,batchId,page){calls.push(['section',studentId,kind,batchId,page]);return [clone(rows[kind])];},
  ...overrides
 };
 return {calls,port,service:createStudentSectionOperations(port,{now:clock})};
}
const err=code=>e=>e?.code===code;

test('profile projection binds to verified student and strips no provider fields',async()=>{
 const f=fixture(); const r=await f.service.getMyProfile(actor);
 assert.equal(r.id,sid);assert.deepEqual(f.calls,[['active',sid],['profile',sid]]);
});
test('student batch list is bounded, owner-bound and safely copied',async()=>{
 const f=fixture();const list=await f.service.listMyBatches(actor,{limit:3,offset:1});
 assert.equal(list.length,1);assert.deepEqual(f.calls[1],['batches',sid,{limit:3,offset:1}]);list[0].name='mutated';
 const list2=await f.service.listMyBatches(actor);assert.equal(list2[0].name,'Science 11');
});
test('batch overview checks active enrollment before reading',async()=>{
 const f=fixture();const x=await f.service.getMyBatchOverview(actor,bid);
 assert.equal(x.subjectCount,4);assert.deepEqual(f.calls.map(c=>c[0]),['active','enrolled','batch']);
});
test('all eight student sections expose validated own-row projections',async t=>{
 for(const kind of studentSectionKinds)await t.test(kind,async()=>{
  const f=fixture();const batchId=kind==='notifications'?null:bid;
  const response=await f.service.listMyBatchSection(actor,batchId,kind,{limit:5});
  assert.deepEqual(response,[rows[kind]]);assert.deepEqual(f.calls.at(-1),['section',sid,kind,batchId,{limit:5,offset:0}]);
 });
});
test('untrusted identity, teacher actor and foreign-role actor fail before data access',async()=>{
 for(const who of [{...actor,verified:false},teacher,{...actor,role:'admin'},{...actor,id:'bad'},null]){
  const f=fixture(); await assert.rejects(()=>f.service.listMyBatches(who),err('UNAUTHENTICATED'));assert.deepEqual(f.calls,[]);
 }
});
test('unavailable port denies reads, and security credential changes remain gated',async()=>{
 const p=createStudentSectionOperations(null,{now:clock});
 await assert.rejects(()=>p.getMyProfile(actor),err('PERSISTENCE_PORT_UNAVAILABLE'));
 await assert.rejects(()=>p.requestPasswordOrMfaChange(actor),err('AUTH_REAUTH_INTEGRATION_REQUIRED'));
});
test('inactive student or unenrolled batch fails before data fetch',async()=>{
 let fetches=0;
 const f=fixture({assertActiveEnrollment:async()=>{throw new Error('DENIED');},listStudentSectionAuthorized:async()=>{fetches++;return []}});
 await assert.rejects(()=>f.service.listMyBatchSection(actor,bid,'materials'),/DENIED/);assert.equal(fetches,0);
 const f2=fixture({assertStudentActive:async()=>{throw new Error('DISABLED');},listStudentBatchesAuthorized:async()=>{fetches++;return []}});
 await assert.rejects(()=>f2.service.listMyBatches(actor),/DISABLED/);assert.equal(fetches,0);
});
test('unknown section, malformed UUID, excessive pagination and unknown filter fields rejected',async()=>{
 const f=fixture();
 await assert.rejects(()=>f.service.listMyBatchSection(actor,bid,'answers'),err('INVALID_SECTION'));
 await assert.rejects(()=>f.service.listMyBatchSection(actor,other,'materials',{limit:26}),err('INVALID_QUERY'));
 await assert.rejects(()=>f.service.listMyBatchSection(actor,'no','materials'),err('INVALID_BATCH_ID'));
 await assert.rejects(()=>f.service.listMyBatches(actor,{studentId:other}),err('INVALID_QUERY'));
 await assert.rejects(()=>f.service.listMyBatchSection(actor,bid,'notifications'),err('INVALID_BATCH_ID'));
});
test('provider foreign student or batch record cannot leak',async()=>{
 for(const patch of [{studentId:other},{batchId:other},{id:'not-a-uuid'}]){
  const f=fixture({listStudentSectionAuthorized:async()=>[{...rows.materials,...patch}]});
  await assert.rejects(()=>f.service.listMyBatchSection(actor,bid,'materials'),err('DATA_ACCESS_VIOLATION'));
 }
});
test('unknown provider fields prevent storage URLs, draft scores, private notes and auth claims leaking',async()=>{
 for(const key of ['storageKey','signedUrl','teacherNote','draftMarks','accessToken']){
  const f=fixture({listStudentSectionAuthorized:async()=>[{...rows.materials,[key]:'SECRET'}]});
  await assert.rejects(()=>f.service.listMyBatchSection(actor,bid,'materials'),err('DATA_ACCESS_VIOLATION'));
 }
});
test('future/unpublished learning resources cannot appear',async()=>{
 for(const kind of ['materials','announcements','assignments']){
  for(const patch of [{status:'draft'},{releasedAt:future}]){
   const f=fixture({listStudentSectionAuthorized:async()=>[{...rows[kind],...patch}]});
   await assert.rejects(()=>f.service.listMyBatchSection(actor,bid,kind),err('DATA_ACCESS_VIOLATION'));
  }
 }
});
test('draft results, invalid marks and cross-student grade rows fail',async()=>{
 for(const patch of [{status:'draft'},{marks:101},{marks:NaN},{rank:0},{studentId:other}]){
  const f=fixture({listStudentSectionAuthorized:async()=>[{...rows.results,...patch}]});
  await assert.rejects(()=>f.service.listMyBatchSection(actor,bid,'results'),err('DATA_ACCESS_VIOLATION'));
 }
});
test('payment projections enforce integer BDT minor-unit invoice reconciliation',async()=>{
 for(const patch of [{currency:'USD'},{totalMinor:99.95},{outstandingMinor:50000},{refundedMinor:60000},{period:'2026-13'},{paidMinor:999999}]){
  const f=fixture({listStudentSectionAuthorized:async()=>[{...rows.payments,...patch}]});
  await assert.rejects(()=>f.service.listMyBatchSection(actor,bid,'payments'),err('DATA_ACCESS_VIOLATION'));
 }
});
test('notification ownership and exact output fields are enforced',async()=>{
 for(const patch of [{studentId:other},{readAt:'not-a-date'},{email:'someone@example.com'}]){
  const f=fixture({listStudentSectionAuthorized:async()=>[{...rows.notifications,...patch}]});
  await assert.rejects(()=>f.service.listMyBatchSection(actor,null,'notifications'),err('DATA_ACCESS_VIOLATION'));
 }
});
test('list output cap and duplicate entries are rejected',async()=>{
 const f=fixture({listStudentSectionAuthorized:async()=>[rows.materials,rows.materials]});
 await assert.rejects(()=>f.service.listMyBatchSection(actor,bid,'materials'),err('DATA_ACCESS_VIOLATION'));
 const f2=fixture({listStudentSectionAuthorized:async()=>Array(26).fill(rows.materials)});
 await assert.rejects(()=>f2.service.listMyBatchSection(actor,bid,'materials',{limit:25}),err('DATA_ACCESS_VIOLATION'));
});
test('profile provider must not return private data or wrong account status',async()=>{
 for(const patch of [{id:other},{role:'teacher'},{accountStatus:'disabled'}]){
  const f=fixture({getStudentProfileAuthorized:async()=>({id:sid,fullName:'Student One',studentCode:'STD100',phone:null,accountStatus:'active',...patch})});
  await assert.rejects(()=>f.service.getMyProfile(actor),err('DATA_ACCESS_VIOLATION'));
 }
});
test('routine schedule and assignment deadline are bounded',async()=>{
 for(const patch of [{weekday:7},{startMinute:601,endMinute:600}]){
  const f=fixture({listStudentSectionAuthorized:async()=>[{...rows.routine,...patch}]});
  await assert.rejects(()=>f.service.listMyBatchSection(actor,bid,'routine'),err('DATA_ACCESS_VIOLATION'));
 }
 const f=fixture({listStudentSectionAuthorized:async()=>[{...rows.assignments,dueAt:release}]});
 await assert.rejects(()=>f.service.listMyBatchSection(actor,bid,'assignments'),err('DATA_ACCESS_VIOLATION'));
});
test('malicious returned batch and overview objects are rejected',async()=>{
 const f=fixture({listStudentBatchesAuthorized:async()=>[{id:bid,studentId:other,name:'Bad',code:'B1',enrollmentStatus:'active'}]});
 await assert.rejects(()=>f.service.listMyBatches(actor),err('DATA_ACCESS_VIOLATION'));
 const f2=fixture({getStudentBatchOverviewAuthorized:async()=>({id:bid,studentId:other,name:'Bad',code:'B1',enrollmentStatus:'active',subjectCount:0,activeAssignments:0,unreadAnnouncements:0})});
 await assert.rejects(()=>f2.service.getMyBatchOverview(actor,bid),err('DATA_ACCESS_VIOLATION'));
});
