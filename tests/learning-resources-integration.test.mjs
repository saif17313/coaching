import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createLearningResourceOperations, resourceStateTransition} from '../src/server/services/learning-resources.mjs';

const [teacherId, studentId, secondStudentId, outsiderId, batchId, anotherBatch, uploadId, materialId, announcementId, eventId] = Array.from({length:10},()=>randomUUID());
const teacher = {id:teacherId,role:'teacher',verified:true};
const student = {id:studentId,role:'student',verified:true};
const secondStudent = {id:secondStudentId,role:'student',verified:true};
const outsider = {id:outsiderId,role:'student',verified:true};
const TIME = '2026-10-16T06:00:00.000Z';
const clock = () => new Date(TIME);
const material = {id:materialId,batchId,uploadId,title:' Chapter 01 ',description:' Basics ',releaseAt:'2026-10-15T00:00:00.000Z'};
const announcement = {id:announcementId,batchId,title:' Important update ',body:' Midterm next week ',visibleFrom:'2026-10-15T00:00:00.000Z'};
const notification = {eventId,batchId,title:' Class moved ',body:' Class is now online '};
const clone = x => structuredClone(x);

function fixture(config={}) {
  let state={materials:{},announcements:{},notifications:{},events:{},audit:[]};
  const enrolled = new Map([[studentId,'active'],[secondStudentId,'pending'],[outsiderId,'active']]);
  const managedBatches = new Set([batchId]);
  const txFrom = draft => ({
    async assertTeacherManagesBatch(id,batch) {if(id!==teacherId||!managedBatches.has(batch)) throw Error('FORBIDDEN_BATCH');},
    async assertMaterialUploadReady(id,upload,batch) {if(id!==teacherId||upload!==uploadId||batch!==batchId)throw Error('INVALID_VERIFIED_UPLOAD');},
    async assertActiveEnrollment(id,batch) {if(batch!==batchId||enrolled.get(id)!=='active'||id===outsiderId) throw Error('NOT_ENROLLED');},
    async createMaterial(item,actorId) {if(draft.materials[item.id])throw Error('DUPLICATE_MATERIAL');draft.materials[item.id]={...clone(item),actorId};return clone(draft.materials[item.id]);},
    async getMaterialForTeacher(id, materialKey) {if(id!==teacherId)throw Error('FORBIDDEN');return clone(draft.materials[materialKey]??null);},
    async updateMaterial(id,patch) {Object.assign(draft.materials[id],clone(patch));return clone(draft.materials[id]);},
    async setMaterialStatus(id,status) {draft.materials[id].status=status;return clone(draft.materials[id]);},
    async getMaterialForAccess(actor,id) {return clone(draft.materials[id]??null);},
    async mintAuthorizedMaterialGrant(actor,id,ttl) {if(!draft.materials[id]||ttl>60)throw Error('GRANT_ERROR');return {url:`https://${config.grantHost??'storage.example.test'}/objects/${id}?sig=secret`,expiresAt:new Date(clock().getTime()+30_000).toISOString()};},
    async createAnnouncement(item,actorId) {if(draft.announcements[item.id])throw Error('DUPLICATE_ANNOUNCEMENT');draft.announcements[item.id]={...clone(item),actorId};return clone(draft.announcements[item.id]);},
    async getAnnouncementForTeacher(id,key) {if(id!==teacherId)throw Error('FORBIDDEN');return clone(draft.announcements[key]??null);},
    async setAnnouncementStatus(id,status) {draft.announcements[id].status=status;return clone(draft.announcements[id]);},
    async enqueueNotificationsForActiveStudents(event) {
      if(draft.events[event.eventId])return {created:0,alreadyProcessed:true};
      draft.events[event.eventId]=true;
      let count=0;
      for(const [id,status] of enrolled) {
        if(status!=='active'||id===outsiderId)continue;
        const key=randomUUID();draft.notifications[key]={id:key,recipientId:id,eventId:event.eventId,title:event.title,body:event.body,readAt:null};count++;
      }
      return {created:count,alreadyProcessed:false};
    },
    async getNotificationForRecipient(recipient,id) {const entry=draft.notifications[id];return entry?.recipientId===recipient?clone(entry):null;},
    async setNotificationReadAt(id,time) {draft.notifications[id].readAt=time;return clone(draft.notifications[id]);},
    async appendAudit(record) {draft.audit.push(clone(record));}
  });
  const port={
    inTransaction: async callback => {
      const staged=clone(state);
      const result=await callback(txFrom(staged));
      state=staged;
      return clone(result);
    },
    assertTeacherManagesBatch:async(id,batch)=>txFrom(state).assertTeacherManagesBatch(id,batch),
    assertActiveEnrollment:async(id,batch)=>txFrom(state).assertActiveEnrollment(id,batch),
    listMaterialsAuthorized:async (actor,batch,q)=>{
      const entries=Object.values(state.materials).filter(r=>r.batchId===batch);
      const visible=actor.role==='student' ? entries.filter(r=>r.status==='published' && (!r.releaseAt||Date.parse(r.releaseAt)<=clock().getTime())):entries;
      return clone((config.leakyMaterialList?[...entries]:visible).slice(q.offset,q.offset+q.limit));
    },
    listAnnouncementsAuthorized:async(actor,batch,q)=>{
      const entries=Object.values(state.announcements).filter(r=>r.batchId===batch);
      const visible=actor.role==='student'?entries.filter(r=>r.status==='published' && (!r.visibleFrom||Date.parse(r.visibleFrom)<=clock().getTime())):entries;
      return clone((config.leakyAnnouncements?[...entries]:visible).slice(q.offset,q.offset+q.limit));
    },
    listNotificationsForRecipient:async(id,q)=>{
      const all=Object.values(state.notifications);
      return clone((config.leakyNotificationList?all:all.filter(r=>r.recipientId===id)).slice(q.offset,q.offset+q.limit));
    }
  };
  return {ops:createLearningResourceOperations(port,{now:clock,allowedStorageHosts:['storage.example.test']}), state:()=>clone(state),port};
}

test('teacher creates draft material and edits safe metadata with atomic audit',async()=>{
  const {ops,state}=fixture();
  const created=await ops.createMaterial(teacher,material);
  assert.equal(created.status,'draft');assert.equal(created.title,'Chapter 01');
  const updated=await ops.updateMaterial(teacher,materialId,{title:' Chapter 02 ',releaseAt:null});
  assert.equal(updated.title,'Chapter 02');assert.equal(updated.releaseAt,null);
  assert.deepEqual(state().audit.map(x=>x.action),['material.created','material.updated']);
  await assert.rejects(ops.updateMaterial(teacher,materialId,{uploadId:randomUUID()}),/INVALID_MATERIAL_PATCH/);
  assert.equal(state().materials[materialId].uploadId,uploadId);
});

test('material publishing, archiving, release windows and student enrollment are enforced',async()=>{
  const {ops}=fixture();
  await ops.createMaterial(teacher,material);
  assert.deepEqual(await ops.listMaterials(student,batchId),[]);
  await assert.rejects(ops.grantMaterialAccess(student,materialId),/RESOURCE_NOT_RELEASED/);
  await assert.rejects(ops.publishMaterial(student,materialId),/FORBIDDEN/);
  await ops.publishMaterial(teacher,materialId);
  assert.equal((await ops.listMaterials(student,batchId)).length,1);
  await assert.rejects(ops.listMaterials(secondStudent,batchId),/NOT_ENROLLED/);
  await assert.rejects(ops.grantMaterialAccess(secondStudent,materialId),/NOT_ENROLLED/);
  await ops.archiveMaterial(teacher,materialId);
  assert.deepEqual(await ops.listMaterials(student,batchId),[]);
  await assert.rejects(ops.publishMaterial(teacher,materialId),/INVALID_RESOURCE_TRANSITION/);
  await assert.rejects(ops.updateMaterial(teacher,materialId,{title:'Changed'}),/RESOURCE_ARCHIVED/);
});

test('storage grants require verified enrollment, safe allowlisted https host and short expiry',async()=>{
  const f=fixture();await f.ops.createMaterial(teacher,material);await f.ops.publishMaterial(teacher,materialId);
  const grant=await f.ops.grantMaterialAccess(student,materialId);
  assert.match(grant.url,/^https:\/\/storage\.example\.test\//);
  assert.equal(Date.parse(grant.expiresAt)-clock().getTime(),30000);
  await assert.rejects(f.ops.grantMaterialAccess(outsider,materialId),/NOT_ENROLLED/);
  const bad=fixture({grantHost:'evil.example.test'});await bad.ops.createMaterial(teacher,material);await bad.ops.publishMaterial(teacher,materialId);
  await assert.rejects(bad.ops.grantMaterialAccess(student,materialId),/INVALID_STORAGE_GRANT/);
  await assert.rejects(createLearningResourceOperations(undefined,{now:clock}).grantMaterialAccess(student,materialId),/STORAGE_HOST_NOT_CONFIGURED/);
});

test('future material and announcement release windows hide student content',async()=>{
  const f=fixture();
  await f.ops.createMaterial(teacher,{...material,releaseAt:'2027-01-01T00:00:00.000Z'});
  await f.ops.publishMaterial(teacher,materialId);
  assert.deepEqual(await f.ops.listMaterials(student,batchId),[]);
  await assert.rejects(f.ops.grantMaterialAccess(student,materialId),/RESOURCE_NOT_RELEASED/);
  await f.ops.createAnnouncement(teacher,{...announcement,visibleFrom:'2027-01-01T00:00:00.000Z'});
  await f.ops.publishAnnouncement(teacher,announcementId);
  assert.deepEqual(await f.ops.listAnnouncements(student,batchId),[]);
  assert.equal((await f.ops.listAnnouncements(teacher,batchId)).length,1);
});

test('announcement lifecycle and membership authorization',async()=>{
  const f=fixture();await f.ops.createAnnouncement(teacher,announcement);
  assert.equal((await f.ops.listAnnouncements(student,batchId)).length,0);
  await assert.rejects(f.ops.createAnnouncement(student,announcement),/FORBIDDEN/);
  await f.ops.publishAnnouncement(teacher,announcementId);
  assert.equal((await f.ops.listAnnouncements(student,batchId)).length,1);
  await assert.rejects(f.ops.listAnnouncements(student,anotherBatch),/NOT_ENROLLED/);
  await f.ops.archiveAnnouncement(teacher,announcementId);
  assert.equal((await f.ops.listAnnouncements(student,batchId)).length,0);
  assert.throws(()=>resourceStateTransition('archived','publish'),/INVALID_RESOURCE_TRANSITION/);
});

test('batch notifications fan out only to active students and dedupe event id',async()=>{
  const f=fixture();
  const sent=await f.ops.notifyBatch(teacher,notification);
  assert.deepEqual(sent,{created:1,alreadyProcessed:false});
  assert.equal((await f.ops.listMyNotifications(student)).length,1);
  assert.equal((await f.ops.listMyNotifications(secondStudent)).length,0);
  assert.equal((await f.ops.listMyNotifications(outsider)).length,0);
  const duplicate=await f.ops.notifyBatch(teacher,notification);
  assert.equal(duplicate.alreadyProcessed,true);
  assert.equal((await f.ops.listMyNotifications(student)).length,1);
  await assert.rejects(f.ops.notifyBatch(student,notification),/FORBIDDEN/);
});

test('notification ownership and read timestamp are enforced, repeat reads idempotent',async()=>{
  const f=fixture();await f.ops.notifyBatch(teacher,notification);
  const item=(await f.ops.listMyNotifications(student))[0];
  await assert.rejects(f.ops.markNotificationRead(secondStudent,item.id),/NOTIFICATION_NOT_FOUND/);
  await f.ops.markNotificationRead(student,item.id);
  await f.ops.markNotificationRead(student,item.id);
  assert.equal((await f.ops.listMyNotifications(student))[0].readAt,TIME);
  assert.equal(f.state().audit.filter(x=>x.action==='notification.read').length,1);
});

test('untrusted actors, invalid fields and absent transaction ports fail closed',async()=>{
  const f=fixture();const untrusted={...teacher,verified:false};
  await assert.rejects(f.ops.createMaterial(untrusted,material),/UNAUTHENTICATED/);
  await assert.rejects(f.ops.createMaterial(student,material),/FORBIDDEN/);
  await assert.rejects(f.ops.createMaterial(teacher,{...material,role:'teacher'}),/INVALID_MATERIAL/);
  await assert.rejects(f.ops.createMaterial(teacher,{...material,uploadId:randomUUID()}),/INVALID_VERIFIED_UPLOAD/);
  assert.deepEqual(f.state().audit,[]);
  await assert.rejects(f.ops.createAnnouncement(teacher,{...announcement,body:'x'}),/INVALID_ANNOUNCEMENT/);
  await assert.rejects(f.ops.notifyBatch(teacher,{...notification,recipientId:studentId}),/INVALID_NOTIFICATION/);
  await assert.rejects(f.ops.listMaterials(teacher,batchId,{limit:101}),/INVALID_PAGINATION/);
  await assert.rejects(f.ops.createMaterial(teacher,{...material,batchId:anotherBatch}),/FORBIDDEN_BATCH/);
  const offline=createLearningResourceOperations(undefined,{now:clock});
  await assert.rejects(offline.createMaterial(teacher,material),/PERSISTENCE_PORT_UNAVAILABLE/);
  await assert.rejects(offline.createAnnouncement(teacher,announcement),/PERSISTENCE_PORT_UNAVAILABLE/);
  await assert.rejects(offline.listMyNotifications(student),/PERSISTENCE_PORT_UNAVAILABLE/);
});

test('defense in depth rejects leaky list port, including other students notifications',async()=>{
  const f=fixture({leakyMaterialList:true,leakyAnnouncements:true,leakyNotificationList:true});
  await f.ops.createMaterial(teacher,material);
  await assert.rejects(f.ops.listMaterials(student,batchId),/DATA_ACCESS_VIOLATION/);
  await f.ops.createAnnouncement(teacher,announcement);
  await assert.rejects(f.ops.listAnnouncements(student,batchId),/DATA_ACCESS_VIOLATION/);
  // Test-only forced tenant leak demonstrates explicit recipient verification.
  const g=fixture({leakyNotificationList:true});
  await g.ops.notifyBatch(teacher,notification);
  await assert.rejects(g.ops.listMyNotifications(secondStudent),/DATA_ACCESS_VIOLATION/);
});

test('failed transactional material inserts do not write partial state or audit',async()=>{
  const f=fixture();await f.ops.createMaterial(teacher,material);
  const snapshot=f.state();
  await assert.rejects(f.ops.createMaterial(teacher,material),/DUPLICATE_MATERIAL/);
  assert.deepEqual(f.state(),snapshot);
});
