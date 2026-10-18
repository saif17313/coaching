import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createOfficeReadEndpoint,createFinanceReportEndpoint} from '../src/server/http/office-reads.mjs';
const U=n=>`123e4567-e89b-42d3-a456-4266141740${String(n).padStart(2,'0')}`;
const teacher=U(1),student=U(2),batch=U(3),due=U(4),plan=U(5),payment=U(6),adjustment=U(7),content=U(8),ann=U(9),notice=U(10),actor2=U(11),upload=U(12);
const now='2026-10-18T02:00:00+00:00',yesterday='2026-10-17T02:00:00+00:00',future='2090-01-01T00:00:00+00:00';
const fixtures={
 batches:[{id:batch,code:'B-01',name:'Batch One',capacity:25,is_archived:false}],
 profiles:[{id:student,role:'student',full_name:'Student One',account_status:'active'}],
 enrollments:[{id:U(13),student_id:student,batch_id:batch,status:'active'}],
 batch_contents:[{id:content,batch_id:batch,upload_id:upload,title:'PDF Module',description:'Chapter one',status:'published',release_at:yesterday,created_at:now,updated_at:now}],
 announcements:[{id:ann,batch_id:batch,title:'New Classes',body:'Next week',status:'published',visible_from:yesterday,created_at:now,updated_at:now}],
 fee_plans:[{id:plan,batch_id:batch,bill_period:'2026-10',amount_minor:120000,currency:'BDT',due_on:'2026-10-25',label:'October Fees',created_at:now}],
 monthly_dues:[{id:due,fee_plan_id:plan,student_id:student,batch_id:batch,bill_period:'2026-10',amount_minor:120000,currency:'BDT',created_at:now}],
 payments:[{id:payment,due_id:due,student_id:student,amount_minor:50000,currency:'BDT',method:'cash',reference:'R-100',created_at:now}],
 payment_adjustments:[{id:adjustment,due_id:due,payment_id:null,kind:'waiver',amount_minor:5000,reason:'Scholarship',created_at:now}],
 notifications:[{id:notice,recipient_id:student,title:'New Notice',body:'Hello there',read_at:null,created_at:now}],
 audit_logs:[{id:3,actor_id:teacher,action:'academic.subject.created',entity_id:batch,occurred_at:now}],
};
const kinds={materials:['teacher',batch,'batch_contents'],announcements:['teacher',batch,'announcements'],feePlans:['teacher',batch,'fee_plans'],batchDues:['teacher',batch,'monthly_dues'],studentDuesTeacher:['teacher',student,'monthly_dues'],studentPaymentsTeacher:['teacher',student,'payments'],duePayments:['teacher',due,'payments'],dueAdjustments:['teacher',due,'payment_adjustments'],myDues:['student',null,'monthly_dues'],myPayments:['student',null,'payments'],teacherNotifications:['teacher',null,'notifications'],myNotifications:['student',null,'notifications'],audit:['teacher',null,'audit_logs'],studentMaterials:['student',batch,'batch_contents'],studentAnnouncements:['student',batch,'announcements']};
function readFake(calls,patch={}){return async (table,token,q)=>{
 calls.push({table,token,q});
 if(patch.throw)throw new Error('internal_secret_key');
 if(patch.table===table)return patch.rows;
 if(table==='notifications'&&q.recipient_id===`eq.${teacher}`)return [{...fixtures.notifications[0],recipient_id:teacher}];
 return (fixtures[table]??[]).filter(row=>Object.entries(q).every(([k,v])=>{
  if(['id','batch_id','student_id','due_id','recipient_id','status','bill_period','actor_id','role'].includes(k)){
   if(v.startsWith('eq.'))return row[k]===v.slice(3);
   if(v.startsWith('in.('))return v.slice(4,-1).split(',').includes(row[k]);
  }
  return true;
 }));
};}
function url(kind,args='') {return `https://example.test/api/v1/${kind}${args?'?'+args:''}`;}
async function run(kind,override={}){
 const [role,target]=kinds[kind];const calls=[];
 const verify=override.verify??(async t=>({verified:true,userId:role==='student'?student:teacher,role,accountStatus:'active',accessToken:t}));
 const readRows=override.readRows??readFake(calls,override.patch);
 const result=await createOfficeReadEndpoint(kind,{verify,readRows})(new Request(override.url??url(kind),{method:override.method??'GET',headers:override.authorization===undefined?{authorization:'Bearer a.b.c'}:override.authorization?{authorization:override.authorization}:{}}),{params:Promise.resolve({batchId:batch,studentId:student,dueId:due,...override.params})});
 return {status:result.status,body:await result.json(),calls,headers:result.headers};
}
for(const [kind,[role,,table]] of Object.entries(kinds)){
 test(`office ${kind}: ${role} can read exact, RLS-scoped ${table} with safe DTO`,async()=>{
  const x=await run(kind);assert.equal(x.status,200,JSON.stringify(x.body));assert.equal(x.body.data.items.length,1);
  assert.equal(x.body.data.items[0].id,fixtures[table][0].id);
  assert.ok(x.calls.every(c=>c.token==='a.b.c'));assert.equal(x.calls.at(-1).table,table);
  assert.match(x.headers.get('cache-control'),/no-store/);
  if(['myDues','myPayments'].includes(kind))assert.equal(x.calls.at(-1).q.student_id,`eq.${student}`);
  if(['materials','announcements'].includes(kind))assert.equal(x.body.data.batch.id,batch);
  if(kind==='audit')assert.equal(x.body.data.items[0].action,'academic.subject.created');
 });
}
test('teacher and student roles never cross, inactive and forged actor rejected before DB',async()=>{
 for(const kind of Object.keys(kinds))for(const patch of [{role:kinds[kind][0]==='teacher'?'student':'teacher'},{accountStatus:'disabled'},{verified:false},{accessToken:'different'},{userId:'invalid'}]){
  let calls=0;const {status}=await run(kind,{verify:async t=>({verified:true,userId:teacher,role:kinds[kind][0],accountStatus:'active',accessToken:t,...patch}),readRows:async()=>{calls++;return [];}});
  assert.ok([401,403].includes(status),`${kind} ${JSON.stringify(patch)} -> ${status}`);assert.equal(calls,0);
 }
});
test('query whitelist blocks unknown filters, duplicate queries, SQL patterns, pagination and invalid UUIDs before Auth',async()=>{
 const items=[['materials','foo=1'],['batchDues','limit=51'],['studentDuesTeacher','billPeriod=2000-99'],['feePlans','billPeriod=2026-10&billPeriod=2026-09'],['audit','actorId=x'],['myPayments','status=paid'],['studentMaterials','status=draft'],['duePayments','offset=-1']];
 for(const [kind,args] of items){let verified=0;const x=await run(kind,{url:url(kind,args),verify:async()=>{verified++;return null;}});assert.equal(x.status,400);assert.equal(verified,0);}
 for(const kind of ['feePlans','duePayments','studentMaterials']){let verified=0;const x=await run(kind,{params:{batchId:'wrong',dueId:'wrong'},verify:async()=>{verified++;return null;}});assert.equal(x.status,400);assert.equal(verified,0);}
 const b=await run('materials',{authorization:'Bearer no-token'});assert.equal(b.status,401);
 const m=await run('audit',{method:'DELETE'});assert.equal(m.status,405);
});
test('batch and student parent records must be unique, no arbitrary ID or role substitution',async()=>{
 const a=await run('materials',{patch:{table:'batches',rows:[...fixtures.batches,...fixtures.batches]}});assert.equal(a.status,502);
 const b=await run('studentDuesTeacher',{patch:{table:'profiles',rows:[{...fixtures.profiles[0],role:'teacher'}]}});assert.equal(b.status,502);
 const c=await run('duePayments',{patch:{table:'monthly_dues',rows:[]}});assert.equal(c.status,404);
});
test('student resource access needs active enrollment and published release window',async()=>{
 const blocked=await run('studentMaterials',{patch:{table:'enrollments',rows:[]}});assert.equal(blocked.status,403);
 const nonPub=await run('studentMaterials',{patch:{table:'batch_contents',rows:[{...fixtures.batch_contents[0],status:'draft'}]}});assert.equal(nonPub.status,502);
 const futureTime=await run('studentAnnouncements',{patch:{table:'announcements',rows:[{...fixtures.announcements[0],visible_from:future}]}});assert.equal(futureTime.status,502);
 const wrongBatch=await run('studentMaterials',{patch:{table:'batch_contents',rows:[{...fixtures.batch_contents[0],batch_id:actor2}]}});assert.equal(wrongBatch.status,502);
});
test('provider may not substitute extra/private fields, wrong money or wrong entity/recipient',async()=>{
 for(const [kind,table,bad] of [
  ['feePlans','fee_plans',{...fixtures.fee_plans[0],secret:'leak'}],
  ['batchDues','monthly_dues',{...fixtures.monthly_dues[0],currency:'USD'}],
  ['studentPaymentsTeacher','payments',{...fixtures.payments[0],student_id:actor2}],
  ['duePayments','payments',{...fixtures.payments[0],due_id:actor2}],
  ['myNotifications','notifications',{...fixtures.notifications[0],recipient_id:actor2}],
  ['audit','audit_logs',{...fixtures.audit_logs[0],details:{private:'secret'}}],
 ]){const x=await run(kind,{patch:{table,rows:[bad]}});assert.equal(x.status,502,kind);assert.doesNotMatch(JSON.stringify(x.body),/secret|leak/);}
 const dup=await run('myDues',{patch:{table:'monthly_dues',rows:[fixtures.monthly_dues[0],fixtures.monthly_dues[0]]}});assert.equal(dup.status,502);
});
test('upstream network errors are sanitized, no token/credentials disclosed',async()=>{
 for(const kind of ['materials','myDues','audit']){const x=await run(kind,{patch:{throw:true}});assert.equal(x.status,503);assert.doesNotMatch(JSON.stringify(x.body),/internal_secret|a\.b\.c/);}
});
test('pagination and status/period filters map to bounded explicit PostgREST queries',async()=>{
 const x=await run('materials',{url:url('materials','status=published&limit=5&offset=3')});assert.equal(x.status,200);assert.equal(x.calls.at(-1).q.status,'eq.published');assert.equal(x.calls.at(-1).q.offset,'3');
 const d=await run('batchDues',{url:url('batchDues','billPeriod=2026-10')});assert.equal(d.status,200);assert.equal(d.calls.at(-1).q.bill_period,'eq.2026-10');
 const a=await run('audit',{url:url('audit',`actorId=${teacher}`)});assert.equal(a.status,200);assert.equal(a.calls.at(-1).q.actor_id,`eq.${teacher}`);
});
async function report(overrides={}){
 const calls=[];const verify=overrides.verify??(async t=>({verified:true,userId:teacher,role:'teacher',accountStatus:'active',accessToken:t}));
 const readRows=overrides.readRows??readFake(calls,overrides.patch);
 const r=await createFinanceReportEndpoint({verify,readRows})(new Request(overrides.url??`https://example.test/api/v1/teacher/batches/${batch}/finance-report?billPeriod=2026-10`,{headers:{authorization:overrides.authorization??'Bearer a.b.c'}}),{params:Promise.resolve({batchId:batch})});
 return {status:r.status,body:await r.json(),calls};
}
test('finance report yields explicit gross BDT totals, with complete count and no derived outstanding',async()=>{
 const r=await report();assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.data.complete,true);assert.equal(r.body.data.dueCount,1);
 assert.deepEqual(r.body.data.totalsMinor,{billed:'120000',payments:'50000',waivers:'5000',refunds:'0',corrections:'0'});assert.equal(r.body.data.currency,'BDT');
 assert.ok(r.calls.filter(x=>['payments','payment_adjustments'].includes(x.table)).every(x=>x.q.due_id===`in.(${due})`));
});
test('finance report forbids 101st due instead of producing inaccurate partial total',async()=>{
 const dues=Array.from({length:101},(_,i)=>({...fixtures.monthly_dues[0],id:`123e4567-e89b-42d3-a456-${String(i+1).padStart(12,'0')}`}));
 const r=await report({patch:{table:'monthly_dues',rows:dues}});assert.equal(r.status,422);assert.equal(r.body.error.code,'REPORT_LIMIT_EXCEEDED');
});
test('finance report verifies student/dues relationship, filters and non-student roles',async()=>{
 const bad=await report({patch:{table:'payments',rows:[{...fixtures.payments[0],student_id:actor2}]}});assert.equal(bad.status,502);
 const q=await report({url:`https://example.test/report?billPeriod=2026-10&offset=2`});assert.equal(q.status,400);
 let called=false;const blocked=await report({verify:async token=>{called=true;return {verified:true,userId:teacher,role:'student',accountStatus:'active',accessToken:token};}});assert.equal(blocked.status,403);assert.equal(called,true);
});
test('production office adapter & repository use verified same JWT, no service-role and no writes',async()=>{
 const paths=['../src/server/http/office-reads.mjs','../src/server/http/production-office-reads.ts','../src/server/supabase/office-read.ts'];
 for(const p of paths){const s=await readFile(new URL(p,import.meta.url),'utf8');assert.doesNotMatch(s,/SUPABASE_SERVICE_ROLE|service_role|method:\s*['"]POST['"]|method:\s*['"]DELETE['"]/i);}
 const adapter=await readFile(new URL(paths[1],import.meta.url),'utf8');assert.match(adapter,/verifyActiveActor/);assert.match(adapter,/officeReadRows/);
});
