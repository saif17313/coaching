import assert from 'node:assert/strict';
import test from 'node:test';
import {createTeacherOverviewEndpoint} from '../src/server/http/teacher-overview.mjs';
const T='abc.def.ghi';
const userId='01910a3f-b7fa-437f-95fa-362953d48ef2';
const counts={'students-total':10,'students-active':6,'students-pending':3,'batches-open':4,'enrollments-pending':2,'enrollments-active':11};
const run=async(patch={},url='http://localhost:3000/api/v1/teacher/overview',authorization=`Bearer ${T}`)=>{
 const calls=[];
 const p={verify:async token=>{calls.push(['verify',token]);return {verified:true,userId,role:'teacher',accountStatus:'active',accessToken:token};},countRows:async(table,token,filter)=>{calls.push(['count',table,token,filter]);return counts[filter];},...patch};
 const result=await createTeacherOverviewEndpoint(p)(new Request(url,{headers:authorization?{authorization}: {}}));
 return {result,body:await result.json(),calls};
};
test('active teacher reads six fixed RLS-scoped aggregate counts',async()=>{
 const {result,body,calls}=await run();
 assert.equal(result.status,200);assert.equal(calls.length,7);
 assert.equal(body.data.studentsTotal,10);assert.equal(body.data.batchesOpen,4);assert.equal(body.data.enrollmentsPending,2);
 assert.match(result.headers.get('cache-control'),/no-store/);
 assert.equal(calls.filter(x=>x[0]==='count'&&x[1]==='profiles').length,3);
 assert.equal(calls.filter(x=>x[0]==='count'&&x[1]==='enrollments').length,2);
});
test('student, pending, disabled, and unverified accounts cannot count',async()=>{
 for(const actor of [{role:'student'}, {accountStatus:'pending'},{accountStatus:'disabled'},{verified:false},{accessToken:'wrong'}, {userId:'not-uuid'}]){
  let called=false;
  const {result}=await run({verify:async token=>({verified:true,userId,role:'teacher',accountStatus:'active',accessToken:token,...actor}),countRows:async()=>{called=true;return 0;}});
  assert.notEqual(result.status,200);assert.equal(called,false);
 }
});
test('invalid bearer and all query inputs fail before verification',async()=>{
 for(const [url,auth,status] of [
  ['http://localhost:3000/api/v1/teacher/overview',null,401],
  ['http://localhost:3000/api/v1/teacher/overview','Basic xyz',401],
  ['http://localhost:3000/api/v1/teacher/overview','Bearer fake',401],
  ['http://localhost:3000/api/v1/teacher/overview?role=teacher',`Bearer ${T}`,400],
  ['http://localhost:3000/api/v1/teacher/overview?foo=1',`Bearer ${T}`,400],
 ]){
  const {result,calls}=await run({},url,auth);assert.equal(result.status,status);assert.deepEqual(calls,[]);
 }
});
test('untrustworthy and upstream count failures fail closed without leaks',async()=>{
 for(const bad of [-1,1.4,NaN,'2',Infinity,Number.MAX_SAFE_INTEGER+1]){
  const {result,body}=await run({countRows:async()=>bad});assert.equal(result.status,502);assert.doesNotMatch(JSON.stringify(body),/Bearer|token|stack/i);
 }
 const r=await run({countRows:async()=>{throw Error('private bearer secret');}});
 assert.equal(r.result.status,503);assert.doesNotMatch(JSON.stringify(r.body),/secret|private/i);
});
test('backend overview gateway contains no service-role credentials or mutations',async()=>{
 const fs=await import('node:fs/promises');
 for(const file of ['../src/server/http/teacher-overview.mjs','../src/server/supabase/count.ts','../src/server/http/production-teacher-overview-adapter.ts']){
  const code=await fs.readFile(new URL(file,import.meta.url),'utf8');
  assert.doesNotMatch(code,/SUPABASE_SERVICE_ROLE|service_role|secretKey|method:\s*['"]POST|method:\s*['"]DELETE/i);
 }
});
