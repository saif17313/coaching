import test from 'node:test';
import assert from 'node:assert/strict';
import {cmsRpcError,cmsError,cmsFailure} from '../src/server/http/cms-errors.mjs';
import {createCmsRoute} from '../src/server/http/cms-core.mjs';
import {createWriteStatusRoute} from '../src/server/write-readiness.mjs';
import {cmsFetch,CmsRequestError} from '../src/client/cms-studio.mjs';
const page='57f05686-5e4c-4011-bb52-8382a83d4740',op='4ce03b61-b6cb-45bb-91b7-234fbd4056ac';
const actor={verified:true,userId:page,role:'teacher',accountStatus:'active'};
const headers={Authorization:'Bearer aaa.bbb.ccc','Content-Type':'application/json','Idempotency-Key':op};
const request=()=>new Request('https://app.example/api/v1/teacher/website/pages/'+page+'/publish',{method:'POST',headers,body:JSON.stringify({expectedRevision:17})});
for(const [code,status] of [['ALREADY_PUBLISHED',409],['REVISION_CONFLICT',409],['IDEMPOTENCY_CONFLICT',409],['INVALID_SECTION',400],['PAGE_NOT_FOUND',404],['FORBIDDEN',403]]){
 test(`Postgres ${code} survives the production RPC error boundary as ${status}`,async()=>{
  const route=createCmsRoute('publish',{verify:async()=>actor,call:async()=>cmsRpcError(Response.json({code:'P0001',message:code,details:'private SQL',hint:'private data'},{status:400}))});
  const res=await route(request(),{params:Promise.resolve({pageId:page})});
  assert.equal(res.status,status);assert.deepEqual(await res.json(),{success:false,error:{code}});
 });
}
test('write gate, missing function and permission errors are distinct, sanitized failures',async()=>{
 assert.deepEqual(cmsFailure(Error('MUTATIONS_DISABLED')),{status:503,code:'MUTATIONS_DISABLED'});
 for(const [dbCode,status,code] of [['PGRST202',503,'CMS_RPC_UNAVAILABLE'],['42501',403,'CMS_PERMISSION_DENIED'],['XX000',503,'CMS_SERVICE_UNAVAILABLE']]){
  await assert.rejects(()=>cmsRpcError(Response.json({code:dbCode,message:'private SQL secret'},{status:400})),e=>e.code===code&&e.status===status&&!e.message.includes('secret'));
 }
});
test('readiness never claims a successful mutation; disabled gate never probes',async()=>{
 for(const gate of [undefined,'enabled-after-db-verification']){
  let calls=0;
  const route=createWriteStatusRoute({env:{COACHING_ENABLE_MUTATION_APIS:gate},verify:async()=>actor,probe:async()=>{calls++;}});
  const res=await route(new Request('https://app.example/status',{headers}));const result=await res.json();
  assert.equal(result.data.writable,Boolean(gate));assert.equal(result.data.mutationVerified,false);assert.equal(calls,gate?1:0);
 }
});
test('readiness preserves expired-session, inactive-role and RPC-outage distinctions',async()=>{
 for(const [status,verify,probe] of [[401,async()=>{throw cmsError('UNAUTHORIZED',401);},async()=>{}],[403,async()=>({...actor,accountStatus:'disabled'}),async()=>{}],[503,async()=>actor,async()=>{throw Error('private upstream');}]]){
  const route=createWriteStatusRoute({env:{COACHING_ENABLE_MUTATION_APIS:'enabled-after-db-verification'},verify,probe});
  assert.equal((await route(new Request('https://app.example/status',{headers}))).status,status);
 }
});
test('client reports unchanged publication as a business conflict without suggesting a restart',async()=>{
 await assert.rejects(()=>cmsFetch('publish',{pageId:page,payload:{expectedRevision:17}},async()=>Response.json({success:false,error:{code:'ALREADY_PUBLISHED'}},{status:409}),()=>op),e=>e instanceof CmsRequestError&&e.code==='ALREADY_PUBLISHED'&&e.status===409&&/already published/.test(e.message)&&!/unavailable|restart/i.test(e.message));
});
