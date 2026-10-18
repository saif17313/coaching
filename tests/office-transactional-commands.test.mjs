import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createOfficeCommand} from '../src/server/http/office-commands.mjs';
const T='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const S='33333333-3333-4333-8333-333333333333';
const E='44444444-4444-4444-8444-444444444444';
const P='55555555-5555-4555-8555-555555555555';
const OP='66666666-6666-4666-8666-666666666666';
const TOKEN='abc.def.ghi';
const actor={verified:true,role:'teacher',accountStatus:'active',userId:T,accessToken:TOKEN};
const def={
 plan:{key:'batchId',target:B,input:{period:'2026-10',amountMinor:50000,dueOn:'2026-10-20',label:'Monthly'},output:{id:P,batchId:B,period:'2026-10',amountMinor:50000,dueOn:'2026-10-20',label:'Monthly'}},
 dues:{key:'planId',target:P,input:{},output:{planId:P,created:2}},
 payment:{key:'dueId',target:B,input:{studentId:S,amountMinor:10000,method:'cash',reference:''},output:{id:E,dueId:B,studentId:S,amountMinor:10000,method:'cash'}},
 waiver:{key:'dueId',target:B,input:{amountMinor:5000,reason:'Approved waiver'},output:{id:E,dueId:B,paymentId:null,kind:'waiver',amountMinor:5000}},
 refund:{key:'paymentId',target:P,input:{amountMinor:2000,reason:'Duplicate payment'},output:{id:E,dueId:B,paymentId:P,kind:'refund',amountMinor:2000}},
 announcement:{key:'batchId',target:B,input:{title:'New routine',body:'Next class schedule is updated',visibleFrom:null},output:{id:E,batchId:B,title:'New routine',status:'draft'}},
 publish:{key:'announcementId',target:E,input:{},output:{id:E,status:'published'}},
 notify:{key:'batchId',target:B,input:{eventId:P,title:'Class update',body:'New class starts tomorrow'},output:{eventId:P,batchId:B,delivered:2}},
};
function req(input,token=TOKEN,key=OP){return new Request('https://example.org/api/v1/teacher/test',{method:'POST',headers:{authorization:`Bearer ${token}`,'idempotency-key':key,'content-type':'application/json'},body:JSON.stringify(input)});}
function endpoint(kind,ports){return createOfficeCommand(kind,ports);}
for(const [kind,d] of Object.entries(def))test(`office ${kind}: exact teacher-only verified RPC command`,async()=>{
 let observed;
 const fn=endpoint(kind,{verify:async()=>actor,execute:async(k,c)=>{observed={k,c};return d.output;}});
 const response=await fn(req(d.input),{params:Promise.resolve({[d.key]:d.target})});
 assert.equal(response.status,201,await response.text().catch(()=>''));
 // Re-run separately to validate returned DTO because body stream consumed by prior diagnostics.
 assert.equal(observed.k,kind);assert.equal(observed.c.target,d.target);assert.equal(observed.c.operationId,OP);
 assert.equal(observed.c.token,TOKEN);assert.deepEqual(observed.c.data,d.input);
});
test('student and disabled teacher are denied before RPC',async()=>{
 const d=def.payment;let hits=0;
 for(const identity of [{...actor,role:'student'},{...actor,accountStatus:'disabled'},{...actor,accessToken:'other'},{...actor,verified:false}]){
  const fn=endpoint('payment',{verify:async()=>identity,execute:async()=>{hits++;return d.output;}});
  assert.equal((await fn(req(d.input),{params:Promise.resolve({dueId:B})})).status,403);
 }
 assert.equal(hits,0);
});
test('all eight write endpoints reject extra fields before verification',async()=>{
 let count=0;
 for(const [kind,d] of Object.entries(def)){
  const fn=endpoint(kind,{verify:async()=>{count++;return actor;},execute:async()=>d.output});
  assert.equal((await fn(req({...d.input,role:'teacher'}),{params:Promise.resolve({[d.key]:d.target})})).status,400,kind);
 }
 assert.equal(count,0);
});
test('strict bearer/operation key and URL target prevent impersonation',async()=>{
 const d=def.plan;let calls=0;
 const fn=endpoint('plan',{verify:async()=>{calls++;return actor;},execute:async()=>d.output});
 for(const [request,target] of [[req(d.input,'not-a-jwt'),B],[req(d.input,TOKEN,'none'),B],[req(d.input),'/etc/passwd']]){
  const res=await fn(request,{params:Promise.resolve({batchId:target})});assert.ok([400,401].includes(res.status));
 }
 assert.equal(calls,0);
});
test('invalid money, dates, method, and material controls fail closed',async()=>{
 const problems=[['plan',{...def.plan.input,amountMinor:1.5},def.plan],['plan',{...def.plan.input,dueOn:'2026-02-30'},def.plan],['payment',{...def.payment.input,amountMinor:-4},def.payment],['payment',{...def.payment.input,method:'creditcard'},def.payment],['waiver',{...def.waiver.input,amountMinor:0},def.waiver],['refund',{...def.refund.input,reason:'no'},def.refund],['announcement',{...def.announcement.input,title:'X'},def.announcement],['notify',{...def.notify.input,eventId:'bad'},def.notify]];
 for(const [kind,data,d] of problems){const fn=endpoint(kind,{verify:async()=>actor,execute:async()=>d.output});assert.equal((await fn(req(data),{params:Promise.resolve({[d.key]:d.target})})).status,400,kind);}
});
test('leaky backend DTOs are denied instead of forwarding private values',async()=>{
 for(const [kind,d] of Object.entries(def)){
  const fn=endpoint(kind,{verify:async()=>actor,execute:async()=>({...d.output,serviceRoleKey:'hidden'})});
  assert.equal((await fn(req(d.input),{params:Promise.resolve({[d.key]:d.target})})).status,502,kind);
 }
});
test('unsafe provider error is sanitized',async()=>{
 const d=def.refund;const fn=endpoint('refund',{verify:async()=>actor,execute:async()=>{throw Error('Secret DB credential');}});
 const res=await fn(req(d.input),{params:Promise.resolve({paymentId:P})});assert.equal(res.status,503);assert.doesNotMatch(await res.text(),/Secret/);
});
test('SQL grants are authenticated-only, no direct financial tables write grants',()=>{
 const sqls=['20261018001000_teacher_finance_transactional_rpcs.sql','20261018001100_teacher_resource_notification_rpcs.sql'].map(x=>readFileSync(new URL('../supabase/migrations/'+x,import.meta.url),'utf8'));
 for(const s of sqls){assert.match(s,/security definer set search_path=''/);assert.match(s,/coaching_mutation_receipts/);assert.match(s,/audit_logs/);assert.doesNotMatch(s,/grant\s+(insert|update|delete)\s+on\s+public\./i);}
 assert.match(sqls[0],/from public\.monthly_dues where id=p_due_id for update/);
 assert.match(sqls[0],/REFUND_EXCEEDS_PAYMENT/);
});
test('production gateway keeps mutation switch and JWT-only database execution',()=>{
 const ts=readFileSync(new URL('../src/server/http/production-office-commands.ts',import.meta.url),'utf8');
 assert.match(ts,/COACHING_ENABLE_MUTATION_APIS/);assert.match(ts,/Bearer \$\{c\.token\}/);assert.doesNotMatch(ts,/SERVICE_ROLE/);assert.match(ts,/https:/);
});
