import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createStudentAcademicEndpoint,studentAcademicKinds} from '../src/server/http/student-academic-reads.mjs';
const id=n=>`11111111-2222-4333-8444-${String(n).padStart(12,'0')}`;
const student=id(1),other=id(2),batch=id(3),subject=id(4),assign=id(5),examId=id(6),enroll=id(7);
const token='header.payload.signature';
const date='2026-10-17T00:00:00Z',future='2026-10-20T00:00:00Z',now=Date.parse('2026-10-18T12:00:00Z');
const subjectRow={id:subject,batch_id:batch,code:'PHY101',title:'Physics 101',created_at:date};
const unit={id:id(8),subject_id:subject,title:'First unit',position:1,created_at:date};
const routine={id:id(9),batch_id:batch,subject_id:subject,day_of_week:1,start_minute:540,end_minute:600,room:'Room A',status:'active'};
const assignment={id:assign,batch_id:batch,subject_id:subject,title:'Exercise 1',release_at:date,due_at:future,max_points:100,status:'published',grades_published:false,instructions:'Read chapter 1',allow_resubmit:false};
const exam={id:examId,batch_id:batch,subject_id:subject,title:'Midterm',scheduled_at:future,max_marks:100,status:'published'};
const enrollRow={id:enroll,student_id:student,batch_id:batch,status:'active'};
const store={enrollments:[enrollRow],academic_subjects:[subjectRow],syllabus_units:[unit],routine_slots:[routine],academic_assignments:[assignment],exams:[exam]};
const routeParams={subjects:{batchId:batch},syllabus:{subjectId:subject},routine:{batchId:batch},assignments:{batchId:batch},assignment:{assignmentId:assign},exams:{batchId:batch},exam:{examId}};
const goodActor={verified:true,userId:student,accessToken:token,accountStatus:'active',role:'student'};
const req=(suffix='',headers=true,method='GET')=>new Request(`http://localhost/api${suffix}`,{method,headers:headers?{authorization:`Bearer ${token}`}:{}});
const make=(kind,overrides={})=>{
 const calls=[];
 const verify=async t=>({...goodActor,...(overrides.actor??{})});
 const readRows=async(table,t,q)=>{
  calls.push({table,token:t,q});
  if(overrides.readRows)return overrides.readRows(table,t,q,calls);
  let records=store[table]??[];
  for(const [key,value] of Object.entries(q))if(['id','batch_id','student_id','subject_id','status'].includes(key)){
   if(value.startsWith('eq.'))records=records.filter(r=>r[key]===value.slice(3));
   if(value==='in.(published,closed)')records=records.filter(r=>['published','closed'].includes(r[key]));
  }
  return records.map(r=>Object.fromEntries(q.select.split(',').map(k=>[k,r[k]])));
 };
 return {get:createStudentAcademicEndpoint(kind,{verify,readRows,now:()=>now}),calls};
};
const query=async (kind,opts={})=>{
 const {get,calls}=make(kind,opts);const res=await get(req(opts.suffix??'',opts.headers!==false,opts.method??'GET'),{params:routeParams[kind]});
 return {status:res.status,body:await res.json(),calls};
};
for(const kind of studentAcademicKinds){
 test(`student academic ${kind}: exact JWT-scoped published-only response`,async()=>{
  const {status,body,calls}=await query(kind);
  assert.equal(status,200);assert.equal(body.success,true);
  assert.ok(calls.every(c=>c.token===token));
  if(kind==='assignment'||kind==='exam')assert.equal(body.data.id,kind==='assignment'?assign:examId);
  else assert.equal(body.data.items.length,1);
  assert.equal(calls.some(c=>c.table==='enrollments'),true);
  if(kind==='assignment')assert.equal(typeof body.data.instructions,'string');
 });
}
test('students cannot read any teacher-only data or act as disabled accounts',async()=>{
 for(const kind of studentAcademicKinds){
  assert.equal((await query(kind,{actor:{role:'teacher'}})).status,403);
  assert.equal((await query(kind,{actor:{accountStatus:'disabled'}})).status,401);
  assert.equal((await query(kind,{actor:{accessToken:'different.token.value'}})).status,401);
 }
});
test('missing or malformed Authorization is rejected before any read',async()=>{
 for(const kind of studentAcademicKinds){
  const r=await query(kind,{headers:false});assert.equal(r.status,401);assert.equal(r.calls.length,0);
 }
});
test('query whitelist rejects pagination abuse, unknown filters and duplicate keys',async()=>{
 for(const kind of studentAcademicKinds){
  for(const suffix of ['?limit=999','?a=1','?limit=1&limit=2','?offset=-2']){
   const r=await query(kind,{suffix});assert.equal(r.status,400);assert.equal(r.calls.length,0);
  }
 }
});
test('method or invalid ID fails before auth',async()=>{
 const p=make('assignments'),got=await p.get(req('',true,'POST'),{params:{batchId:batch}});
 assert.equal(got.status,405);assert.equal(p.calls.length,0);
 const q=make('exams'),invalid=await q.get(req(),{params:{batchId:'arbitrary'}});
 assert.equal(invalid.status,400);assert.equal(q.calls.length,0);
});
test('inactive and missing membership never expose academic listings',async()=>{
 for(const kind of ['subjects','routine','assignments','exams']){
  const {status,calls}=await query(kind,{readRows:(table)=>table==='enrollments'?[]:structuredClone(store[table])});
  assert.equal(status,404);assert.deepEqual(calls.map(x=>x.table),['enrollments']);
 }
});
test('syllabus enforces its parent subject membership',async()=>{
 const r=await query('syllabus',{readRows:(table)=>table==='academic_subjects'?[{...subjectRow,batch_id:other}]:[]});
 assert.equal(r.status,404);assert.deepEqual(r.calls.map(c=>c.table),['academic_subjects','enrollments']);
});
test('assignment and exam details require active enrollment',async()=>{
 for(const kind of ['assignment','exam']){
  const r=await query(kind,{readRows:(table)=>table==='enrollments'?[]:structuredClone(store[table])});
  assert.equal(r.status,404);
 }
});
test('unpublished, future and malformed data are never returned',async()=>{
 const variants=[['assignments',{...assignment,status:'draft'}],['assignments',{...assignment,release_at:future}],['exams',{...exam,status:'draft'}],['routine',{...routine,status:'archived'}]];
 for(const [kind,bad] of variants){
  const target={assignments:'academic_assignments',exams:'exams',routine:'routine_slots'}[kind];
  const r=await query(kind,{readRows:(table)=>table==='enrollments'?[enrollRow]:table===target?[bad]:[]});
  assert.equal(r.status,502,kind);
 }
});
test('provider cannot substitute foreign batch or extra private columns',async()=>{
 for(const kind of ['subjects','routine','assignments','exams']){
  const table={subjects:'academic_subjects',routine:'routine_slots',assignments:'academic_assignments',exams:'exams'}[kind];
  for(const tamper of [row=>({...row,batch_id:other}),row=>({...row,secret:'private'})]){
   const r=await query(kind,{readRows:(name)=>name==='enrollments'?[enrollRow]:name===table?[tamper(store[table][0])]:[]});
   assert.equal(r.status,502);
  }
 }
});
test('duplicate rows and overlong result arrays are rejected',async()=>{
 const duplicate=await query('subjects',{readRows:(table)=>table==='enrollments'?[enrollRow]:[subjectRow,subjectRow]});
 assert.equal(duplicate.status,502);
 const tooMany=await query('subjects',{suffix:'?limit=1',readRows:(table)=>table==='enrollments'?[enrollRow]:[subjectRow,subjectRow]});
 assert.equal(tooMany.status,502);
});
test('read errors are sanitized and tokens are never echoed',async()=>{
 const {status,body}=await query('subjects',{readRows:()=>{throw Error(`DB ERROR ${token}`);}});
 assert.equal(status,503);assert.equal(JSON.stringify(body).includes(token),false);
});
test('returned values are stripped of SQL status fields and cache disabled',async()=>{
 const {get}=make('exams');const res=await get(req(),{params:routeParams.exams});
 assert.equal(res.headers.get('cache-control'),'private, no-store');
 const data=(await res.json()).data.items[0];assert.equal(Object.hasOwn(data,'status'),false);
});
test('production student adapter is JWT and RLS only without service-role or mutations',()=>{
 const adapter=fs.readFileSync('src/server/http/production-student-academic-adapter.ts','utf8');
 assert.match(adapter,/verifyActiveActor/);assert.match(adapter,/readSupabaseAcademicRows/);
 assert.doesNotMatch(adapter,/service_role|SUPABASE_SERVICE|adminClient|COACHING_ENABLE_MUTATION_APIS/);
 for(const kind of studentAcademicKinds){
  const paths={subjects:'batches/[batchId]/subjects',syllabus:'subjects/[subjectId]/syllabus',routine:'batches/[batchId]/routine',assignments:'batches/[batchId]/assignments',assignment:'assignments/[assignmentId]',exams:'batches/[batchId]/exams',exam:'exams/[examId]'};
  const route=fs.readFileSync(`src/app/api/v1/student/${paths[kind]}/route.ts`,'utf8');
  assert.match(route,/studentAcademicRoute/);assert.doesNotMatch(route,/export const POST|export const PATCH|export const DELETE/);
 }
});
