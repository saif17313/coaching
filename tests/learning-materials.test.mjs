import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createLearningMaterialRoute,validMaterialCommand,materialBytes,validPdfFilename} from '../src/server/http/learning-materials.mjs';
const actor='11111111-1111-4111-8111-111111111111',batch='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333',operation='44444444-4444-4444-8444-444444444444',token='abc.def.ghi';
const pdf=new TextEncoder().encode('%PDF-1.4\nDEMO PDF test\n%%EOF\n'),ctx={params:Promise.resolve({batchId:batch,materialId:id})};
const request=(method='POST',body=pdf,extra={})=>new Request('http://localhost/api/materials',{method,headers:{authorization:'Bearer '+token,'idempotency-key':operation,'x-upload-id':id,'x-filename':'DEMO.pdf','Content-Type':'application/pdf',...extra},...(method==='GET'?{}:{body})});
const verify=async()=>({verified:true,userId:actor,role:'teacher',accountStatus:'active'});
test('material upload verifies actor, hashes actual bytes, and returns only registered metadata',async()=>{
 let uploaded=false;const route=createLearningMaterialRoute('upload',{verify,upload:async x=>{assert.equal(x.key,`${actor}/${batch}/${id}.pdf`);assert.deepEqual(x.bytes,pdf);uploaded=true;},call:async(name,t,args)=>{assert.equal(uploaded,true);assert.equal(name,'coaching_learning_upload_register');assert.equal(t,token);assert.equal(args.p_sha256,createHash('sha256').update(pdf).digest('hex'));return {id,filename:'DEMO.pdf',contentType:'application/pdf',sizeBytes:pdf.length};}});
 const response=await route(request(),ctx);assert.equal(response.status,201);assert.equal((await response.json()).data.id,id);
});
test('Student upload is denied before file bytes or Storage are touched',async()=>{
 let called=false;const route=createLearningMaterialRoute('upload',{verify:async()=>({...await verify(),role:'student'}),upload:async()=>{called=true;}});assert.equal((await route(request(),ctx)).status,403);assert.equal(called,false);
});
test('material upload rejects fake PDFs, MIME mismatch and oversized streams before Storage',async()=>{
 let called=false;const route=createLearningMaterialRoute('upload',{verify,upload:async()=>{called=true;}});
 assert.equal((await route(request('POST','<script>not a PDF</script>'),ctx)).status,400);
 assert.equal((await route(request('POST',pdf,{'Content-Type':'text/html'}),ctx)).status,415);
 assert.equal((await route(request('POST',pdf,{'content-length':'5242881'}),ctx)).status,413);
 assert.equal(called,false);await assert.rejects(materialBytes(new Request('http://localhost',{method:'POST',body:new Uint8Array(5242881)})),e=>e.status===413);
 assert.equal(validPdfFilename('../secret.pdf'),false);assert.equal(validPdfFilename('DEMO\n.pdf'),false);
});
test('Student download verifies integrity and sends private attachment security headers',async()=>{
 const file={id,uploadId:id,key:`${actor}/${batch}/${id}.pdf`,filename:'DEMO résumé.pdf',contentType:'application/pdf',sizeBytes:pdf.length,sha256:createHash('sha256').update(pdf).digest('hex')};
 const route=createLearningMaterialRoute('studentFile',{verify:async()=>({...await verify(),role:'student'}),call:async()=>file,readObject:async()=>pdf});const r=await route(request('GET'),ctx);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.match(r.headers.get('content-disposition'),/^attachment;/);assert.match(r.headers.get('content-security-policy'),/sandbox/);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),pdf);
 const corrupt=createLearningMaterialRoute('studentFile',{verify:async()=>({...await verify(),role:'student'}),call:async()=>file,readObject:async()=>new Uint8Array(pdf.length)});assert.equal((await corrupt(request('GET'),ctx)).status,502);
 const hidden=createLearningMaterialRoute('studentFile',{verify:async()=>({...await verify(),role:'student'}),call:async()=>null});assert.equal((await hidden(request('GET'),ctx)).status,404);
});
test('material commands require complete payloads and optimistic concurrency; DB conflicts survive',async()=>{
 const body={action:'publish',materialId:id,uploadId:null,title:null,description:null,releaseAt:null,expectedUpdatedAt:'2026-10-20T16:00:00.123456Z'};assert.equal(validMaterialCommand(body),true);assert.equal(validMaterialCommand({...body,expectedUpdatedAt:null}),false);assert.equal(validMaterialCommand({...body,unexpected:true}),false);
 const route=createLearningMaterialRoute('write',{verify,call:async()=>{throw Object.assign(Error('conflict'),{code:'REVISION_CONFLICT',status:409});}});const r=await route(request('POST',JSON.stringify(body),{'Content-Type':'application/json'}),ctx);assert.equal(r.status,409);assert.equal((await r.json()).error.code,'REVISION_CONFLICT');
});
