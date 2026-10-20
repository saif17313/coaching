import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {academicList,academicCommand,academicPublish,activeBatchRoster,academicModes} from '../src/client/teacher-academics.mjs';
const id='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const fetcher=(body,{status=200,onRequest=()=>{}}={})=>async(url,init)=>{onRequest(url,init);return {ok:status>=200&&status<300,status,headers:{get:()=> 'application/json'},json:async()=>body};};
const success=(data)=>({success:true,data});
const uuid=()=>other;
test('Part R reads six exact reviewed academic routes with no cookie/Auth token',async()=>{
 const segments={subjects:`batches/${id}/subjects`,syllabus:`subjects/${id}/syllabus`,routine:`batches/${id}/routine`,assignments:`batches/${id}/assignments`,exams:`batches/${id}/exams`,results:`exams/${id}/results`};
 for(const scope of academicModes){
  let called=0;
  const res=await academicList(scope,id,{offset:0,limit:20},fetcher(success({items:[],pagination:{offset:0,limit:20}}),{onRequest(url,init){called++;assert.equal(url,`/api/v1/teacher/${segments[scope]}?limit=20&offset=0`);assert.equal(init.method,'GET');assert.equal(init.credentials,'same-origin');assert.equal(init.headers,undefined);}}));
  assert.equal(called,1);assert.deepEqual(res.items,[]);
 }
});
test('Part R rejects bad IDs and unauthorized filters without network calls',()=>{
 for(const scope of academicModes){assert.throws(()=>academicList(scope,'not-uuid'),/Invalid academic filter/);assert.throws(()=>academicList(scope,id,{limit:200}),/Invalid academic filter/);}
 assert.throws(()=>academicList('payments',id),/Invalid academic filter/);
});
test('Part R rejects duplicate and substituted records',async()=>{
 await assert.rejects(()=>academicList('subjects',id,{},fetcher(success({items:[{id},{id}],pagination:{offset:0,limit:20}}))),/Invalid academic record/);
 await assert.rejects(()=>academicList('exams',id,{},fetcher(success({items:[{id:'forged'}],pagination:{offset:0,limit:20}}))),/Invalid academic record/);
});
test('Part R academic subjects, syllabus and routine use protected DTOs and idempotency',async()=>{
 const cases=[
  ['subject',{code:'MATH_01',title:'Mathematics'},`/api/v1/teacher/batches/${id}/subjects/create`],
  ['syllabus',{title:'Unit one',position:1},`/api/v1/teacher/subjects/${id}/syllabus/add`],
  ['routine',{subjectId:id,dayOfWeek:2,startMinute:540,endMinute:600,room:'Room 2'},`/api/v1/teacher/batches/${id}/routine-slots`],
  ['assignment',{subjectId:id,title:'Assignment one',instructions:'Solve all tasks',releaseAt:'2026-10-19T10:00:00.000Z',dueAt:'2026-10-20T10:00:00.000Z',maxPoints:100,allowResubmit:false},`/api/v1/teacher/batches/${id}/assignment-drafts`],
  ['exam',{subjectId:id,title:'Final examination',scheduledAt:'2026-10-22T10:00:00.000Z',maxMarks:100},`/api/v1/teacher/batches/${id}/exam-drafts`],
  ['result',{studentId:id,marks:85.25},`/api/v1/teacher/exams/${id}/results/draft`]
 ];
 for(const [kind,input,route] of cases){
  let calls=0;await academicCommand(kind,id,input,fetcher(success({id}),{onRequest(url,opts){calls++;assert.equal(url,route);assert.equal(opts.credentials,'same-origin');assert.equal(opts.headers['Idempotency-Key'],other);assert.equal(opts.headers['x-musa-ui'],'1');assert.equal(opts.headers['Content-Type'],'application/json');assert.deepEqual(JSON.parse(opts.body),input);}}),uuid);
  assert.equal(calls,1);
 }
});
test('Part R rejects invalid academic drafts before sending',()=>{
 assert.throws(()=>academicCommand('subject',id,{code:'DROP TABLE',title:'Math'}),/valid uppercase/);
 assert.throws(()=>academicCommand('syllabus',id,{title:'Unit',position:0}),/valid syllabus/);
 assert.throws(()=>academicCommand('routine',id,{subjectId:id,dayOfWeek:7,startMinute:60,endMinute:120,room:''}),/Choose a subject/);
 assert.throws(()=>academicCommand('assignment',id,{subjectId:id,title:'Test',instructions:'Do it',releaseAt:'2026-10-21T10:00:00.000Z',dueAt:'2026-10-20T10:00:00.000Z',maxPoints:100,allowResubmit:false}),/Check the assignment/);
 assert.throws(()=>academicCommand('exam',id,{subjectId:id,title:'Test',scheduledAt:'bad',maxMarks:10}),/Check the exam/);
 assert.throws(()=>academicCommand('result',id,{studentId:id,marks:-1}),/valid score/);
 assert.throws(()=>academicCommand('result',id,{studentId:id,marks:4.001}),/valid score/);
 assert.throws(()=>academicCommand('result',id,{studentId:id,marks:100,admin:true}),/complete every required/);
});
test('Part R publication is bodyless, idempotent and correct for all three workflows',async()=>{
 for(const [kind,route] of [['assignment',`assignments/${id}/publish`],['exam',`exams/${id}/publish`],['results',`exams/${id}/results/publish`]]){
  let calls=0;await academicPublish(kind,id,fetcher(success({status:'published'}),{onRequest(url,opts){calls++;assert.equal(url,`/api/v1/teacher/${route}`);assert.equal(opts.method,'POST');assert.equal(opts.headers['Idempotency-Key'],other);assert.equal(opts.headers['x-musa-ui'],'1');assert.equal(opts.body,undefined);assert.equal(opts.headers['Content-Type'],undefined);}}),uuid);
  assert.equal(calls,1);
 }
});
test('Part R roster supports only active verified student memberships',async()=>{
 let calls=0;const items=await activeBatchRoster(id,{},fetcher(success({entries:[{student:{id:other,fullName:'A student'},enrollment:{id:other,studentId:other,batchId:id,status:'active'}}]}),{onRequest(url){calls++;assert.equal(url,`/api/v1/teacher/batches/${id}/roster?limit=20&offset=0&status=active`);}}));
 assert.deepEqual(items,[{id:other,name:'A student'}]);assert.equal(calls,1);
 await assert.rejects(()=>activeBatchRoster(id,{},fetcher(success({entries:[{student:{id:other},enrollment:{id:other,studentId:other,batchId:id,status:'pending'}}]}))),/Invalid roster entry/);
});
test('Part R surfaces permission and gate failures without pretending success',async()=>{
 await assert.rejects(()=>academicList('subjects',id,{},fetcher({success:false,error:{code:'UNAUTHORIZED'}},{status:401})),/Session expired/);
 await assert.rejects(()=>academicCommand('subject',id,{code:'MATH_01',title:'Math'},fetcher({success:false,error:{code:'SERVICE_UNAVAILABLE'}},{status:503}),uuid),/service is temporarily unavailable/);
 await assert.rejects(()=>academicPublish('exam',id,fetcher({success:false,error:{code:'FORBIDDEN'}},{status:403}),uuid),/not authorized/);
});
test('Part R portal routes all six academic sections to Studio and retains management/CMS',()=>{
 const base=new URL('../src/components/portal/',import.meta.url);
 const portal=readFileSync(new URL('PortalClient.tsx',base),'utf8');
 const studio=readFileSync(new URL('TeacherAcademicStudio.tsx',base),'utf8');
 assert.match(portal,/isTeacherAcademic&&batch\?<TeacherAcademicStudio/);
 assert.match(portal,/isTeacherManagement\?<TeacherManagement/);
 assert.match(portal,/isCms\?<WebsiteAdminStudio/);
 for(const key of academicModes){assert.match(portal,new RegExp(`id:'${key}',label:`));}
 assert.match(studio,/window\.confirm\(/);
 assert.match(studio,/activeBatchRoster\(/);
 assert.match(studio,/role="dialog"/);
 assert.doesNotMatch(studio,/service_role|SUPABASE_SERVICE|localStorage|sessionStorage/);
});
