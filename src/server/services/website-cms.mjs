/**
 * Offline website CMS service with immutable publication snapshots.
 * Production transaction port MUST atomically lock revisions, verify media,
 * enforce teacher website grants, write audit rows, and persist snapshot+pointer.
 * No public route, database adapter, or storage signer is wired in this file.
 */
export class WebsiteCmsError extends Error {constructor(code){super(code);this.name='WebsiteCmsError';this.code=code;}}
const fail=code=>{throw new WebsiteCmsError(code);};
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const shape=(x,allowed,required=[])=>obj(x)&&required.every(k=>Object.hasOwn(x,k))&&Object.keys(x).every(k=>allowed.includes(k));
const text=(x,min,max)=>typeof x==='string'&&x.trim().length>=min&&x.trim().length<=max&&!/[\u0000-\u0008\u000b\u000e-\u001f]/.test(x);
const int=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const copy=x=>structuredClone(x);
const slug=x=>typeof x==='string'&&/^[a-z][a-z0-9-]{1,62}$/.test(x)&&!x.endsWith('-')&&!x.includes('--');
const sectionKinds=new Set(['hero','rich-text','cards','gallery','results','courses','contact','cta','faq','news','reviews','academic-calendar','routine','materials','footer']);
function checkActor(actor){if(!obj(actor)||actor.verified!==true||actor.role!=='teacher'||!uuid(actor.id))fail('UNAUTHENTICATED');}
function need(x,key){if(!x||typeof x[key]!=='function')fail('PERSISTENCE_PORT_UNAVAILABLE');}
function txNeed(x,key){if(!x||typeof x[key]!=='function')fail('TRANSACTION_PORT_INCOMPLETE');}
function validUrl(u){
  if(u===null)return true;
  if(typeof u!=='string'||u.length>2048)return false;
  try {const x=new URL(u);return x.protocol==='https:'&&Boolean(x.hostname)&&!x.username&&!x.password&&x.hash.length<400;}
  catch{return false;}
}
function pageInput(p){
  if(!shape(p,['id','slug','title','seoTitle','seoDescription'],['id','slug','title','seoTitle','seoDescription'])||!uuid(p.id)||!slug(p.slug)||
     !text(p.title,2,160)||!text(p.seoTitle,2,160)||!text(p.seoDescription,0,300))fail('INVALID_PAGE');
  return {id:p.id,slug:p.slug,title:p.title.trim(),seoTitle:p.seoTitle.trim(),seoDescription:p.seoDescription.trim()};
}
function pagePatch(p){
  if(!shape(p,['title','seoTitle','seoDescription'])||Object.keys(p).length===0)fail('INVALID_PAGE_PATCH');
  const out={};
  for(const k of Object.keys(p)){if(!text(p[k],k==='seoDescription'?0:2,k==='seoDescription'?300:160))fail('INVALID_PAGE_PATCH');out[k]=p[k].trim();}
  return out;
}
function sectionInput(s){
  if(!shape(s,['id','kind','order','heading','body','visible'],['id','kind','order','heading','body','visible'])||!uuid(s.id)||!sectionKinds.has(s.kind)||
     !int(s.order,0,1000)||!text(s.heading,0,160)||!text(s.body,0,6000)||typeof s.visible!=='boolean')fail('INVALID_SECTION');
  return {...s,heading:s.heading.trim(),body:s.body.trim()};
}
function itemInput(i){
  if(!shape(i,['id','order','title','description','mediaId','url','visible'],['id','order','title','description','mediaId','url','visible'])||
     !uuid(i.id)||!int(i.order,0,1000)||!text(i.title,0,160)||!text(i.description,0,2000)||
     (i.mediaId!==null&&!uuid(i.mediaId))||!validUrl(i.url)||typeof i.visible!=='boolean')fail('INVALID_SECTION_ITEM');
  return {...i,title:i.title.trim(),description:i.description.trim()};
}
function mediaInput(m){
  if(!shape(m,['id','storageKey','contentType','sizeBytes','sha256','alt'],['id','storageKey','contentType','sizeBytes','sha256','alt'])||!uuid(m.id)||
     typeof m.storageKey!=='string'||!/^website\/[a-z0-9][a-z0-9/_-]{1,180}\.(jpg|jpeg|png|webp|avif)$/.test(m.storageKey)||m.storageKey.includes('//')||
     !['image/jpeg','image/png','image/webp','image/avif'].includes(m.contentType)||!int(m.sizeBytes,1,5*1024*1024)||
     !/^[0-9a-f]{64}$/.test(m.sha256)||!text(m.alt,2,200))fail('INVALID_MEDIA');
  return {...m,alt:m.alt.trim()};
}
function globalPatch(p){
  const names=['siteTitle','tagline','contactEmail','contactPhone','footerText','logoMediaId'];
  if(!shape(p,names)||Object.keys(p).length===0)fail('INVALID_GLOBAL_SETTINGS');
  const out={...p};
  for(const key of Object.keys(out)){
    const value=out[key];
    if(key==='logoMediaId'){if(value!==null&&!uuid(value))fail('INVALID_GLOBAL_SETTINGS');continue;}
    if(key==='contactEmail'){if(typeof value!=='string'||value.length>254||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).test(value))fail('INVALID_GLOBAL_SETTINGS');continue;}
    if(key==='contactPhone'){if(value!==null&&(typeof value!=='string'||!/^\+?[0-9][0-9 -]{6,18}$/.test(value)))fail('INVALID_GLOBAL_SETTINGS');continue;}
    if(!text(value,key==='siteTitle'?2:0,key==='footerText'?1000:160))fail('INVALID_GLOBAL_SETTINGS');out[key]=value.trim();
  }
  return out;
}
function expected(n){if(!int(n,1,1000000000))fail('INVALID_REVISION');}
function pageRow(x,id,revision){
  if(!obj(x)||x.id!==id||x.status==='archived'||!['draft','published'].includes(x.status)||!int(x.draftRevision,1,1000000000))fail('PAGE_NOT_EDITABLE');
  if(x.draftRevision!==revision)fail('REVISION_CONFLICT');
}
async function manager(tx,actor){txNeed(tx,'assertCanManageWebsite');await tx.assertCanManageWebsite(actor.id);}
async function audit(tx,actor,action,id){txNeed(tx,'appendAudit');await tx.appendAudit({actorId:actor.id,action,entityId:id});}
function assertPublicSnapshot(snapshot){
  if(!shape(snapshot,['schemaVersion','slug','revision','title','seoTitle','seoDescription','sections'],['schemaVersion','slug','revision','title','seoTitle','seoDescription','sections'])||
     snapshot.schemaVersion!==1||!slug(snapshot.slug)||!int(snapshot.revision,1,1000000000)||!text(snapshot.title,2,160)||
     !text(snapshot.seoTitle,2,160)||!text(snapshot.seoDescription,0,300)||!Array.isArray(snapshot.sections)||snapshot.sections.length>60)fail('INVALID_PUBLIC_SNAPSHOT');
  const secIds=new Set();const secOrders=new Set();
  for(const sec of snapshot.sections){
    if(!shape(sec,['id','kind','order','heading','body','items'],['id','kind','order','heading','body','items'])||!uuid(sec.id)||secIds.has(sec.id)||
       !sectionKinds.has(sec.kind)||!int(sec.order,0,1000)||secOrders.has(sec.order)||!text(sec.heading,0,160)||!text(sec.body,0,6000)||
       !Array.isArray(sec.items)||sec.items.length>100)fail('INVALID_PUBLIC_SNAPSHOT');
    secIds.add(sec.id);secOrders.add(sec.order);
    const ids=new Set();const orders=new Set();
    for(const item of sec.items){
      if(!shape(item,['id','order','title','description','mediaId','url'],['id','order','title','description','mediaId','url'])||
         !uuid(item.id)||ids.has(item.id)||!int(item.order,0,1000)||orders.has(item.order)||!text(item.title,0,160)||
         !text(item.description,0,2000)||(item.mediaId!==null&&!uuid(item.mediaId))||!validUrl(item.url))fail('INVALID_PUBLIC_SNAPSHOT');
      ids.add(item.id);orders.add(item.order);
    }
  }
  return copy(snapshot);
}
function publicSettings(data){
  if(!shape(data,['revision','siteTitle','tagline','contactEmail','contactPhone','footerText','logoMediaId'],['revision','siteTitle','tagline','contactEmail','contactPhone','footerText','logoMediaId'])||
     !int(data.revision,1,1000000000))fail('INVALID_PUBLIC_SETTINGS');
  globalPatch(Object.fromEntries(Object.entries(data).filter(([k])=>k!=='revision')));
  return copy(data);
}
export function createWebsiteCmsOperations(port){
  return Object.freeze({
    async createPageDraft(actor,input){
      checkActor(actor);const p=pageInput(input);need(port,'inTransaction');
      return port.inTransaction(async tx=>{await manager(tx,actor);txNeed(tx,'assertSlugAvailable');await tx.assertSlugAvailable(p.slug);
        txNeed(tx,'insertPageDraft');const row=await tx.insertPageDraft({...p,status:'draft',draftRevision:1,publishedRevision:null});await audit(tx,actor,'cms.page.created',p.id);return copy(row);});
    },
    async updatePageDraft(actor,id,revision,patch){
      checkActor(actor);if(!uuid(id))fail('INVALID_ID');expected(revision);const p=pagePatch(patch);need(port,'inTransaction');
      return port.inTransaction(async tx=>{await manager(tx,actor);txNeed(tx,'getPageLocked');const row=await tx.getPageLocked(id);pageRow(row,id,revision);
        txNeed(tx,'updatePageDraft');const updated=await tx.updatePageDraft(id,revision,copy(p));await audit(tx,actor,'cms.page.draft.updated',id);return copy(updated);});
    },
    async upsertSectionDraft(actor,pageId,revision,input){
      checkActor(actor);if(!uuid(pageId))fail('INVALID_ID');expected(revision);const section=sectionInput(input);need(port,'inTransaction');
      return port.inTransaction(async tx=>{await manager(tx,actor);txNeed(tx,'getPageLocked');pageRow(await tx.getPageLocked(pageId),pageId,revision);
        txNeed(tx,'assertSectionIdAvailableForPage');await tx.assertSectionIdAvailableForPage(section.id,pageId);
        txNeed(tx,'upsertSectionDraft');const row=await tx.upsertSectionDraft(pageId,revision,copy(section));await audit(tx,actor,'cms.section.upserted',section.id);return copy(row);});
    },
    async upsertItemDraft(actor,pageId,sectionId,revision,input){
      checkActor(actor);if(!uuid(pageId)||!uuid(sectionId))fail('INVALID_ID');expected(revision);const item=itemInput(input);need(port,'inTransaction');
      return port.inTransaction(async tx=>{await manager(tx,actor);txNeed(tx,'getPageLocked');pageRow(await tx.getPageLocked(pageId),pageId,revision);
        txNeed(tx,'assertSectionInPage');await tx.assertSectionInPage(sectionId,pageId);
        if(item.mediaId){txNeed(tx,'assertPublicReadyMedia');await tx.assertPublicReadyMedia(item.mediaId);}
        txNeed(tx,'assertItemIdAvailableForSection');await tx.assertItemIdAvailableForSection(item.id,sectionId);
        txNeed(tx,'upsertItemDraft');const row=await tx.upsertItemDraft(pageId,sectionId,revision,copy(item));await audit(tx,actor,'cms.item.upserted',item.id);return copy(row);});
    },
    async publishPage(actor,pageId,revision){
      checkActor(actor);if(!uuid(pageId))fail('INVALID_ID');expected(revision);need(port,'inTransaction');
      return port.inTransaction(async tx=>{await manager(tx,actor);txNeed(tx,'getPageLocked');const row=await tx.getPageLocked(pageId);pageRow(row,pageId,revision);if(row.publishedRevision===revision)fail('ALREADY_PUBLISHED');
        txNeed(tx,'getPageDraftSnapshotLocked');const snapshot=assertPublicSnapshot(await tx.getPageDraftSnapshotLocked(pageId));
        if(snapshot.slug!==row.slug||snapshot.revision!==revision)fail('INVALID_PUBLIC_SNAPSHOT');
        txNeed(tx,'assertSnapshotMediaReady');await tx.assertSnapshotMediaReady(copy(snapshot));
        txNeed(tx,'publishSnapshotAtomic');await tx.publishSnapshotAtomic(pageId,revision,copy(snapshot));await audit(tx,actor,'cms.page.published',pageId);
        return copy({pageId,revision});});
    },
    async archivePage(actor,pageId,revision){
      checkActor(actor);if(!uuid(pageId))fail('INVALID_ID');expected(revision);need(port,'inTransaction');
      return port.inTransaction(async tx=>{await manager(tx,actor);txNeed(tx,'getPageLocked');pageRow(await tx.getPageLocked(pageId),pageId,revision);
        txNeed(tx,'archivePageAtomic');await tx.archivePageAtomic(pageId,revision);await audit(tx,actor,'cms.page.archived',pageId);return {pageId,status:'archived'};});
    },
    async getPublicPage(pageSlug){
      if(!slug(pageSlug))fail('INVALID_SLUG');need(port,'readPublishedPage');const row=await port.readPublishedPage(pageSlug);
      if(row===null)return null;
      if(!shape(row,['slug','status','publishedRevision','snapshot'],['slug','status','publishedRevision','snapshot'])||row.status!=='published'||row.slug!==pageSlug)fail('DATA_ACCESS_VIOLATION');
      const snapshot=assertPublicSnapshot(row.snapshot);
      if(snapshot.slug!==pageSlug||row.publishedRevision!==snapshot.revision)fail('DATA_ACCESS_VIOLATION');
      return snapshot;
    },
    async registerMediaMetadata(actor,input){
      checkActor(actor);const m=mediaInput(input);need(port,'inTransaction');
      return port.inTransaction(async tx=>{await manager(tx,actor);txNeed(tx,'assertUploadedMediaVerified');await tx.assertUploadedMediaVerified(copy(m));
        txNeed(tx,'registerMediaReady');const row=await tx.registerMediaReady(copy(m));await audit(tx,actor,'cms.media.registered',m.id);return copy(row);});
    },
    async archiveMedia(actor,id){
      checkActor(actor);if(!uuid(id))fail('INVALID_ID');need(port,'inTransaction');
      return port.inTransaction(async tx=>{await manager(tx,actor);txNeed(tx,'assertMediaNotInPublishedSnapshot');await tx.assertMediaNotInPublishedSnapshot(id);
        txNeed(tx,'archiveMedia');await tx.archiveMedia(id);await audit(tx,actor,'cms.media.archived',id);return {id,status:'archived'};});
    },
    async updateGlobalDraft(actor,revision,patch){
      checkActor(actor);expected(revision);const p=globalPatch(patch);need(port,'inTransaction');
      return port.inTransaction(async tx=>{await manager(tx,actor);txNeed(tx,'getGlobalSettingsLocked');const row=await tx.getGlobalSettingsLocked();
        if(!obj(row)||row.draftRevision!==revision)fail('REVISION_CONFLICT');
        txNeed(tx,'updateGlobalDraft');const updated=await tx.updateGlobalDraft(revision,copy(p));await audit(tx,actor,'cms.global.draft.updated',actor.id);return copy(updated);});
    },
    async publishGlobal(actor,revision){
      checkActor(actor);expected(revision);need(port,'inTransaction');
      return port.inTransaction(async tx=>{await manager(tx,actor);txNeed(tx,'getGlobalSettingsLocked');const row=await tx.getGlobalSettingsLocked();
        if(!obj(row)||row.draftRevision!==revision)fail('REVISION_CONFLICT');if(row.publishedRevision===revision)fail('ALREADY_PUBLISHED');
        const snap=publicSettings({...row.draft,revision});
        if(snap.logoMediaId){txNeed(tx,'assertPublicReadyMedia');await tx.assertPublicReadyMedia(snap.logoMediaId);}
        txNeed(tx,'publishGlobalAtomic');await tx.publishGlobalAtomic(revision,copy(snap));await audit(tx,actor,'cms.global.published',actor.id);return {revision};});
    },
    async getPublicGlobal(){
      need(port,'readPublishedGlobal');const data=await port.readPublishedGlobal();
      return data===null?null:publicSettings(data);
    }
  });
}
