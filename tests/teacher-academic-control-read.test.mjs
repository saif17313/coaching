import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTeacherAcademicEndpoint} from '../src/server/http/teacher-academic-reads.mjs';
const uuid=(n)=>`123e4567-e89b-42d3-a456-4266141740${String(n).padStart(2,'0')}`;
const actorId=uuid(1),batchId=uuid(2),subjectId=uuid(3),unitId=uuid(4),routineId=uuid(5),assignmentId=uuid(6),examId=uuid(7),resultId=uuid(8),studentId=uuid(9);
const date='2026-10-18T00:00:00+00:00',later='2026-10-19T00:00:00+00:00';
const db={
 batches:[{id:batchId,code:'CSE-01',name:'Morning Batch',capacity:40,is_archived:false}],
 academic_subjects:[{id:subjectId,batch_id:batchId,code:'MATH01',title:'Mathematics',created_at:date}],
 syllabus_units:[{id:unitId,subject_id:subjectId,title:'Algebra',position:1,created_at:date}],
 routine_slots:[{id:routineId,batch_id:batchId,subject_id:subjectId,day_of_week:2,start_minute:600,end_minute:660,room:'Room A',status:'active'}],
 academic_assignments:[{id:assignmentId,batch_id:batchId,subject_id:subjectId,title:'Exercise 1',release_at:date,due_at:later,max_points:100,status:'draft',grades_published:false}],
 exams:[{id:examId,batch_id:batchId,subject_id:subjectId,title:'Midterm',scheduled_at:date,max_marks:100,status:'draft'}],
 exam_results:[{id:resultId,exam_id:examId,student_id:studentId,marks:null,result_status:'draft',rank:null}],
};
const ids={batchId,subjectId,examId};
const path={subjects:`batches/${batchId}/subjects`,syllabus:`subjects/${subjectId}/syllabus`,routine:`batches/${batchId}/routine`,assignments:`batches/${batchId}/assignments`,exams:`batches/${batchId}/exams`,results:`exams/${examId}/results`};
async function invoke(kind,override={}){
 const calls=[];
 const verify=override.verify??(async token=>({verified:true,userId:actorId,role:'teacher',accountStatus:'active',accessToken:token}));
 const readRows=override.readRows??(async(table,token,query)=>{calls.push({table,token,query});const rows=db[table]??[];return rows.filter(r=>Object.entries(query).every(([k,v])=>!['id','batch_id','subject_id','exam_id','status','result_status'].includes(k)||r[k]===v.slice(3)));});
 const req=new Request(override.url??`https://example.test/api/v1/teacher/${path[kind]}`,{method:override.method??'GET',headers:override.authorization===undefined?{Authorization:'Bearer x.y.z'}:override.authorization?{Authorization:override.authorization}:{}});
 const response=await createTeacherAcademicEndpoint(kind,{verify,readRows})(req,{params:Promise.resolve(override.params??ids)});
 return {response,json:await response.json(),calls};
}
for(const [kind,table] of Object.entries({subjects:'academic_subjects',syllabus:'syllabus_units',routine:'routine_slots',assignments:'academic_assignments',exams:'exams',results:'exam_results'})){
 test(`${kind}: verified teacher reads matching RLS-scoped ${table} with fixed DTO`,async()=>{
  const {response,json,calls}=await invoke(kind);
  assert.equal(response.status,200);assert.equal(json.data.items.length,1);assert.equal(calls.at(-1).table,table);
  assert.equal(json.data.items[0].id,db[table][0].id);assert.equal(json.data.pagination.limit,20);
  assert.ok(calls.every(c=>c.token==='x.y.z'));
  assert.match(response.headers.get('cache-control'),/no-store/);
 });
}
test('pagination/status filters are bounded and mapped to explicit PostgREST columns',async()=>{
 const a=await invoke('assignments',{url:`https://example.test/api/v1/teacher/${path.assignments}?limit=5&offset=10&status=draft`});
 assert.equal(a.response.status,200);assert.equal(a.calls.at(-1).query.status,'eq.draft');assert.equal(a.calls.at(-1).query.limit,'5');
 const b=await invoke('results',{url:`https://example.test/api/v1/teacher/${path.results}?status=draft`});
 assert.equal(b.response.status,200);assert.equal(b.calls.at(-1).query.result_status,'eq.draft');
});
test('six endpoints deny students, disabled teachers, forged tokens before database reads',async()=>{
 for(const kind of Object.keys(path))for(const patch of [{role:'student'},{accountStatus:'disabled'},{verified:false},{accessToken:'bad'},{userId:'bad'}]){
  let reads=0;
  const {response}=await invoke(kind,{verify:async t=>({verified:true,userId:actorId,role:'teacher',accountStatus:'active',accessToken:t,...patch}),readRows:async()=>{reads++;return [];}});
  assert.ok([401,403].includes(response.status));assert.equal(reads,0);
 }
});
test('invalid query keys, duplicate filters, oversized pagination, routes, method and bearer fail before verify',async()=>{
 const cases=[['subjects',{url:`https://x.test/${path.subjects}?studentId=1`}],['exams',{url:`https://x.test/${path.exams}?limit=100`}],['exams',{url:`https://x.test/${path.exams}?status=published&status=draft`}],['syllabus',{url:`https://x.test/${path.syllabus}?status=active`}],['routine',{url:`https://x.test/${path.routine}?status=draft`}],['results',{params:{...ids,examId:'invalid'}}],['assignments',{method:'POST'}],['subjects',{authorization:'Bearer invalid'}]];
 for(const [kind,opts] of cases){let verifies=0;const {response}=await invoke(kind,{...opts,verify:async()=>{verifies++;return {};}});assert.notEqual(response.status,200);assert.equal(verifies,0);}
});
test('empty list is valid, missing parent yields 404 without list access',async()=>{
 const a=await invoke('subjects',{readRows:async(table)=>table==='batches'?db.batches:[]});assert.equal(a.response.status,200);assert.equal(a.json.data.items.length,0);
 const calls=[];const b=await invoke('exams',{readRows:async(table)=>{calls.push(table);return [];}});assert.equal(b.response.status,404);assert.deepEqual(calls,['batches']);
});
test('provider cannot substitute foreign IDs or private extra columns or duplicate rows',async()=>{
 for(const bad of [[{...db.academic_subjects[0],batch_id:actorId}],[{...db.academic_subjects[0],email:'leak@example.test'}],[db.academic_subjects[0],db.academic_subjects[0]]]){
  const {response,json}=await invoke('subjects',{readRows:async table=>table==='batches'?db.batches:bad});assert.equal(response.status,502);assert.doesNotMatch(JSON.stringify(json),/leak@example/);
 }
});
test('result reader blocks unpublished grade data outside strict teacher and max mark bounds',async()=>{
 for(const row of [{...db.exam_results[0],marks:110},{...db.exam_results[0],result_status:'published',marks:null,rank:null},{...db.exam_results[0],studentEmail:'secret'}]){
  const {response}=await invoke('results',{readRows:async(table)=>table==='exams'?db.exams:[row]});assert.equal(response.status,502);
 }
});
test('mismatched parent records or duplicate parent are rejected before dependent query',async()=>{
 for(const kind of ['syllabus','subjects','results']){
  let reads=0;const {response}=await invoke(kind,{readRows:async(table)=>{reads++;return [db[table][0],db[table][0]];}});
  assert.equal(response.status,502);assert.equal(reads,1);
 }
});
test('provider exceptions never leak keys, tokens or internal error details',async()=>{
 const {response,json}=await invoke('routine',{readRows:async()=>{throw Error('secret_credentials');}});
 assert.equal(response.status,503);assert.doesNotMatch(JSON.stringify(json),/secret|credentials|x\.y\.z/);
});
test('repository and adapter are read-only JWT-scoped without service role and routes use teacher Auth',async()=>{
 for(const file of ['../src/server/http/teacher-academic-reads.mjs','../src/server/http/production-teacher-academic-adapter.ts','../src/server/supabase/academic-read.ts']){
  const s=await readFile(new URL(file,import.meta.url),'utf8');assert.doesNotMatch(s,/SUPABASE_SERVICE_ROLE|service_role|method:\s*['"]POST['"]|['"]DELETE['"]/i);
 }
 const adapter=await readFile(new URL('../src/server/http/production-teacher-academic-adapter.ts',import.meta.url),'utf8');assert.match(adapter,/verifyActiveActor/);assert.match(adapter,/readSupabaseAcademicRows/);
});
