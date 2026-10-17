/**
 * Offline service orchestration for material, announcement and notification workflows.
 * No production persistence, file storage, authentication or HTTP adapter is included.
 * Production transaction adapters MUST re-check authorization, membership and locks.
 */
export class ResourceError extends Error {
  constructor(code) { super(code); this.name = 'ResourceError'; this.code = code; }
}
const fail = code => { throw new ResourceError(code); };
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const exact = (v, keys, required) => plain(v) && required.every(k => Object.hasOwn(v, k)) && Object.keys(v).every(k => keys.includes(k));
const text = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
const timestamp = v => v === null || (typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(v) && Number.isFinite(Date.parse(v)));
const copy = v => structuredClone(v);
function actorCheck(actor, teacher = false) {
  if (!plain(actor) || actor.verified !== true || !uuid(actor.id) || !['teacher','student'].includes(actor.role)) fail('UNAUTHENTICATED');
  if (teacher && actor.role !== 'teacher') fail('FORBIDDEN');
}
function portCheck(port, method) { if (!port || typeof port[method] !== 'function') fail('PERSISTENCE_PORT_UNAVAILABLE'); }
function txCheck(tx, method) { if (!tx || typeof tx[method] !== 'function') fail('TRANSACTION_PORT_INCOMPLETE'); }
function listQuery(q = {}) {
  if (!exact(q, ['limit','offset'], [])) fail('INVALID_QUERY');
  const limit = q.limit ?? 20, offset = q.offset ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) fail('INVALID_PAGINATION');
  return {limit, offset};
}
function materialInput(v) {
  if (!exact(v,['id','batchId','uploadId','title','description','releaseAt'],['id','batchId','uploadId','title']) ||
      !uuid(v.id) || !uuid(v.batchId) || !uuid(v.uploadId) || !text(v.title,2,160) ||
      (v.description !== undefined && !text(v.description,0,2000)) ||
      (v.releaseAt !== undefined && !timestamp(v.releaseAt))) fail('INVALID_MATERIAL');
  return {id:v.id,batchId:v.batchId,uploadId:v.uploadId,title:v.title.trim(),description:v.description?.trim() ?? '',releaseAt:v.releaseAt ?? null,status:'draft'};
}
function materialPatch(v) {
  if (!exact(v,['title','description','releaseAt'],[]) || !Object.keys(v).length ||
      (Object.hasOwn(v,'title') && !text(v.title,2,160)) ||
      (Object.hasOwn(v,'description') && !text(v.description,0,2000)) ||
      (Object.hasOwn(v,'releaseAt') && !timestamp(v.releaseAt))) fail('INVALID_MATERIAL_PATCH');
  return {...v,...(Object.hasOwn(v,'title') ? {title:v.title.trim()} : {}),...(Object.hasOwn(v,'description') ? {description:v.description.trim()} : {})};
}
function announcementInput(v) {
  if (!exact(v,['id','batchId','title','body','visibleFrom'],['id','batchId','title','body']) ||
      !uuid(v.id) || !uuid(v.batchId) || !text(v.title,2,160) || !text(v.body,2,10000) ||
      (v.visibleFrom !== undefined && !timestamp(v.visibleFrom))) fail('INVALID_ANNOUNCEMENT');
  return {id:v.id,batchId:v.batchId,title:v.title.trim(),body:v.body.trim(),visibleFrom:v.visibleFrom ?? null,status:'draft'};
}
function notificationInput(v) {
  if (!exact(v,['eventId','batchId','title','body'],['eventId','batchId','title','body']) ||
      !uuid(v.eventId) || !uuid(v.batchId) || !text(v.title,2,160) || !text(v.body,2,2000)) fail('INVALID_NOTIFICATION');
  return {eventId:v.eventId,batchId:v.batchId,title:v.title.trim(),body:v.body.trim()};
}
function stateTransition(current, event) {
  if (event === 'publish' && current === 'draft') return 'published';
  if (event === 'archive' && ['draft','published'].includes(current)) return 'archived';
  fail('INVALID_RESOURCE_TRANSITION');
}
function ensureReleased(resource, date) {
  if (!resource || resource.status !== 'published') fail('RESOURCE_NOT_RELEASED');
  const release = resource.releaseAt ?? resource.visibleFrom;
  if (release && Date.parse(release) > date.getTime()) fail('RESOURCE_NOT_RELEASED');
}
async function ownBatch(tx, actor, batchId) {
  txCheck(tx,'assertTeacherManagesBatch');
  await tx.assertTeacherManagesBatch(actor.id,batchId);
}
async function accessBatch(port, actor, batchId) {
  if (!uuid(batchId)) fail('INVALID_BATCH_ID');
  if (actor.role === 'teacher') {
    portCheck(port,'assertTeacherManagesBatch');
    await port.assertTeacherManagesBatch(actor.id,batchId);
  } else {
    portCheck(port,'assertActiveEnrollment');
    await port.assertActiveEnrollment(actor.id,batchId);
  }
}
async function changeState(port, actor, id, type, event) {
  actorCheck(actor,true);
  if (!uuid(id)) fail(type === 'material' ? 'INVALID_MATERIAL_ID' : 'INVALID_ANNOUNCEMENT_ID');
  portCheck(port,'inTransaction');
  return port.inTransaction(async tx => {
    const getter = type === 'material' ? 'getMaterialForTeacher' : 'getAnnouncementForTeacher';
    const updater = type === 'material' ? 'setMaterialStatus' : 'setAnnouncementStatus';
    txCheck(tx,getter); txCheck(tx,updater); txCheck(tx,'appendAudit');
    const record = await tx[getter](actor.id,id);
    if (!record) fail('RESOURCE_NOT_FOUND');
    await ownBatch(tx,actor,record.batchId);
    const status = stateTransition(record.status,event);
    if (type === 'material' && event === 'publish') {
      txCheck(tx,'assertMaterialUploadReady');
      await tx.assertMaterialUploadReady(actor.id,record.uploadId,record.batchId);
    }
    const result = await tx[updater](record.id,status);
    await tx.appendAudit({actorId:actor.id,action:`${type}.${event}`,entityId:record.id});
    return result;
  });
}

/**
 * The caller supplies ONLY a trusted server-derived actor and adapter. The default
 * object has no port and denies all DB/storage operations. No HTTP routes ship.
 */
export function createLearningResourceOperations(port, options = {}) {
  const now = options.now ?? (()=>new Date());
  if (typeof now !== 'function') fail('INVALID_CLOCK');
  const allowedStorageHosts = options.allowedStorageHosts ?? [];
  if (!Array.isArray(allowedStorageHosts) || allowedStorageHosts.some(x=>typeof x!=='string' || x.length>253)) fail('INVALID_STORAGE_CONFIGURATION');
  function currentTime() {
    const value=now();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail('INVALID_CLOCK');
    return value;
  }
  return Object.freeze({
    async createMaterial(actor,input) {
      actorCheck(actor,true);const draft = materialInput(input);
      portCheck(port,'inTransaction');
      return port.inTransaction(async tx => {
        await ownBatch(tx,actor,draft.batchId);
        txCheck(tx,'assertMaterialUploadReady'); txCheck(tx,'createMaterial'); txCheck(tx,'appendAudit');
        await tx.assertMaterialUploadReady(actor.id,draft.uploadId,draft.batchId);
        const result=await tx.createMaterial(copy(draft),actor.id);
        await tx.appendAudit({actorId:actor.id,action:'material.created',entityId:draft.id});
        return result;
      });
    },
    async updateMaterial(actor,id,patch) {
      actorCheck(actor,true);if(!uuid(id)) fail('INVALID_MATERIAL_ID');
      const safe=materialPatch(patch);portCheck(port,'inTransaction');
      return port.inTransaction(async tx => {
        txCheck(tx,'getMaterialForTeacher');txCheck(tx,'updateMaterial');txCheck(tx,'appendAudit');
        const record=await tx.getMaterialForTeacher(actor.id,id);
        if(!record) fail('RESOURCE_NOT_FOUND');
        await ownBatch(tx,actor,record.batchId);
        if(record.status==='archived') fail('RESOURCE_ARCHIVED');
        const result=await tx.updateMaterial(id,copy(safe));
        await tx.appendAudit({actorId:actor.id,action:'material.updated',entityId:id});
        return result;
      });
    },
    publishMaterial(actor,id) {return changeState(port,actor,id,'material','publish');},
    archiveMaterial(actor,id) {return changeState(port,actor,id,'material','archive');},
    async listMaterials(actor,batchId,query={}) {
      actorCheck(actor); const page=listQuery(query);
      await accessBatch(port,actor,batchId);
      portCheck(port,'listMaterialsAuthorized');
      const items=await port.listMaterialsAuthorized(actor,batchId,page);
      if(!Array.isArray(items) || items.some(x=>!x || x.batchId!==batchId)) fail('DATA_ACCESS_VIOLATION');
      if(actor.role==='student') {
        const date=currentTime();
        if(items.some(x=>x.status!=='published'|| (x.releaseAt && Date.parse(x.releaseAt)>date.getTime()))) fail('DATA_ACCESS_VIOLATION');
      }
      return items;
    },
    async grantMaterialAccess(actor,id) {
      actorCheck(actor);if(!uuid(id)) fail('INVALID_MATERIAL_ID');
      // Never allow arbitrary URL minting without an explicit storage host allowlist.
      if(!allowedStorageHosts.length) fail('STORAGE_HOST_NOT_CONFIGURED');
      portCheck(port,'inTransaction');
      const date=currentTime();
      const grant=await port.inTransaction(async tx=>{
        txCheck(tx,'getMaterialForAccess');txCheck(tx,'mintAuthorizedMaterialGrant');
        const resource=await tx.getMaterialForAccess(actor,id);
        if(!resource) fail('RESOURCE_NOT_FOUND');
        if(actor.role==='student') {
          txCheck(tx,'assertActiveEnrollment');
          await tx.assertActiveEnrollment(actor.id,resource.batchId);
          ensureReleased(resource,date);
        } else await ownBatch(tx,actor,resource.batchId);
        // Storage signer MUST repeat all access checks before minting a <=60s URL.
        return tx.mintAuthorizedMaterialGrant(actor,resource.id,60);
      });
      if(!grant || typeof grant.url!=='string' || typeof grant.expiresAt!=='string') fail('INVALID_STORAGE_GRANT');
      let url;
      try{url=new URL(grant.url);}catch{fail('INVALID_STORAGE_GRANT');}
      const expires=Date.parse(grant.expiresAt);
      if(url.protocol!=='https:' || !allowedStorageHosts.includes(url.hostname) || url.username || url.password || grant.url.length>4096 ||
         !Number.isFinite(expires) || expires<=date.getTime() || expires>date.getTime()+60000) fail('INVALID_STORAGE_GRANT');
      return copy({url:grant.url,expiresAt:grant.expiresAt});
    },
    async createAnnouncement(actor,input) {
      actorCheck(actor,true);const draft=announcementInput(input);portCheck(port,'inTransaction');
      return port.inTransaction(async tx=>{
        await ownBatch(tx,actor,draft.batchId);txCheck(tx,'createAnnouncement');txCheck(tx,'appendAudit');
        const result=await tx.createAnnouncement(copy(draft),actor.id);
        await tx.appendAudit({actorId:actor.id,action:'announcement.created',entityId:draft.id});
        return result;
      });
    },
    publishAnnouncement(actor,id) {return changeState(port,actor,id,'announcement','publish');},
    archiveAnnouncement(actor,id) {return changeState(port,actor,id,'announcement','archive');},
    async listAnnouncements(actor,batchId,query={}) {
      actorCheck(actor);const page=listQuery(query);await accessBatch(port,actor,batchId);
      portCheck(port,'listAnnouncementsAuthorized');
      const items=await port.listAnnouncementsAuthorized(actor,batchId,page);
      if(!Array.isArray(items)||items.some(x=>!x||x.batchId!==batchId)) fail('DATA_ACCESS_VIOLATION');
      if(actor.role==='student') {
        const date=currentTime();
        if(items.some(x=>x.status!=='published'||(x.visibleFrom && Date.parse(x.visibleFrom)>date.getTime()))) fail('DATA_ACCESS_VIOLATION');
      }
      return items;
    },
    async notifyBatch(actor,input) {
      actorCheck(actor,true);const event=notificationInput(input);portCheck(port,'inTransaction');
      return port.inTransaction(async tx=>{
        await ownBatch(tx,actor,event.batchId);
        txCheck(tx,'enqueueNotificationsForActiveStudents');txCheck(tx,'appendAudit');
        const result=await tx.enqueueNotificationsForActiveStudents(copy(event),actor.id);
        await tx.appendAudit({actorId:actor.id,action:'notification.batch_sent',entityId:event.eventId});
        return result;
      });
    },
    async listMyNotifications(actor,query={}) {
      actorCheck(actor);const page=listQuery(query);portCheck(port,'listNotificationsForRecipient');
      const items=await port.listNotificationsForRecipient(actor.id,page);
      if(!Array.isArray(items)||items.some(x=>!x||x.recipientId!==actor.id)) fail('DATA_ACCESS_VIOLATION');
      return items;
    },
    async markNotificationRead(actor,id) {
      actorCheck(actor);if(!uuid(id)) fail('INVALID_NOTIFICATION_ID');portCheck(port,'inTransaction');
      return port.inTransaction(async tx=>{
        txCheck(tx,'getNotificationForRecipient');txCheck(tx,'setNotificationReadAt');
        const item=await tx.getNotificationForRecipient(actor.id,id);
        if(!item) fail('NOTIFICATION_NOT_FOUND');
        // Idempotent, no spurious repeat audit.
        if(item.readAt) return item;
        txCheck(tx,'appendAudit');
        const updated=await tx.setNotificationReadAt(item.id,currentTime().toISOString());
        await tx.appendAudit({actorId:actor.id,action:'notification.read',entityId:item.id});
        return updated;
      });
    }
  });
}

export const resourceStateTransition=stateTransition;
export const validateLearningMaterial=materialInput;
export const validateAnnouncementDraft=announcementInput;
