import test from 'node:test';
import assert from 'node:assert/strict';
import {domainRpcError,RpcError} from '../src/server/http/rpc-errors.mjs';
import {teacherPublishEndpoint} from '../src/server/http/academic-publication.mjs';
import {validOrganization} from '../src/client/cms-order.mjs';
import {createCmsOrganizeRoute} from '../src/server/http/cms-organize-route.mjs';
import {authAdminHeaders} from '../src/server/auth-admin-headers.mjs';
import {signupFailure} from '../src/server/student-onboard.mjs';
const id='8950c167-84fc-4734-a66d-4015a2d370d1',second='8950c167-84fc-4734-a66d-4015a2d370d2',operation='8950c167-84fc-4734-a66d-4015a2d370d3';
test('database conflicts remain actionable and raw provider details remain private',async()=>{
 for(const [code,message,status,publicCode] of [['23P01','private SQL text',409,'SCHEDULE_CONFLICT'],['23505','private SQL text',409,'RESOURCE_CONFLICT'],['42501','private table name',403,'DB_PERMISSION_DENIED'],['P0001','ASSIGNMENT_NOT_DRAFT',409,'ASSIGNMENT_NOT_DRAFT'],['P0001','unknown private message',503,'DB_SERVICE_UNAVAILABLE']]){
  await assert.rejects(()=>domainRpcError(Response.json({code,message,details:'secret'})),e=>e instanceof RpcError&&e.status===status&&e.code===publicCode&&!e.message.includes('private'));
 }
});
test('Teacher publication preserves business conflict without accepting editable fields',async()=>{
 let calls=0;const route=teacherPublishEndpoint('assignment',{verify:async()=>({verified:true,userId:id,role:'teacher',accountStatus:'active',accessToken:'a.b.c'}),execute:async()=>{calls++;throw new RpcError('ASSIGNMENT_NOT_DRAFT',409);}});
 const request=body=>new Request('https://app.example/publish',{method:'POST',headers:{Authorization:'Bearer a.b.c','Idempotency-Key':operation,'Content-Type':'application/json'},...(body?{body}: {})});
 const ctx={params:Promise.resolve({assignmentId:id})};
 assert.equal((await route(request('{}'),ctx)).status,400);assert.equal(calls,0);
 const response=await route(request(),ctx);assert.equal(response.status,409);assert.equal((await response.json()).error.code,'ASSIGNMENT_NOT_DRAFT');assert.equal(calls,1);
});
test('ordering rejects duplicate IDs, cross-operation payloads and excessive bounds',()=>{
 const body={action:'sections.reorder',sectionId:null,itemId:null,orderIds:[id,second],expectedRevision:2};
 assert.ok(validOrganization(body));
 for(const invalid of [{...body,orderIds:[id,id]},{...body,itemId:id},{...body,expectedRevision:0},{...body,extra:true},{...body,orderIds:Array(61).fill(id)}])assert.equal(validOrganization(invalid),false);
});
test('Student organization cannot call RPC and mutation receipts must match target/revision',async()=>{
 const body={action:'items.reorder',sectionId:second,itemId:null,orderIds:[id],expectedRevision:2};let calls=0;
 const request=()=>new Request('https://app.example/organize',{method:'POST',headers:{Authorization:'Bearer a.b.c','Idempotency-Key':operation,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const ctx={params:Promise.resolve({pageId:id})};
 const ports={verify:async()=>({verified:true,role:'student',accountStatus:'active'}),call:async()=>{calls++;return {id,revision:2,status:'draft'};}};
 assert.equal((await createCmsOrganizeRoute(ports)(request(),ctx)).status,403);assert.equal(calls,0);
 ports.verify=async()=>({verified:true,role:'teacher',accountStatus:'active'});
 assert.equal((await createCmsOrganizeRoute(ports)(request(),ctx)).status,502);assert.equal(calls,1);
});
test('Auth secret API key is not used as a user JWT and public keys are rejected',()=>{
 const secret='sb_secret_'+'x'.repeat(32);assert.deepEqual(authAdminHeaders(secret),{apikey:secret,'Content-Type':'application/json'});
 for(const value of [undefined,'','sb_publishable_'+'x'.repeat(32),secret+'\n','arbitrary-token'])assert.equal(authAdminHeaders(value),null);
});
test('disabled public signup is explicit and never described as mutation gate failure',()=>{
 assert.deepEqual(signupFailure(422,{code:'signup_disabled'}),{status:403,code:'AUTH_SIGNUP_DISABLED'});
 assert.deepEqual(signupFailure(429,{}),{status:429,code:'AUTH_RATE_LIMIT'});
 assert.deepEqual(signupFailure(422,{code:'weak_password'}),{status:400,code:'AUTH_WEAK_PASSWORD'});
});
