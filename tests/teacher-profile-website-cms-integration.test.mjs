import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebsiteCmsOperations } from '../src/server/services/website-cms.mjs';
import { createTeacherProfileSettings } from '../src/server/services/teacher-profile-settings.mjs';

const ids = ['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666','77777777-7777-4777-8777-777777777777','88888888-8888-4888-8888-888888888888'];
const [teacherId,otherId,pageId,secId,itemId,mediaId,otherPageId,otherSecId] = ids;
const teacher={id:teacherId,role:'teacher',verified:true};
const intruder={id:otherId,role:'teacher',verified:true};
const student={id:otherId,role:'student',verified:true};
const page=()=>({id:pageId,slug:'courses',title:'Our Courses',seoTitle:'Courses at Musa Sir',seoDescription:'Learn with us'});
const section=()=>({id:secId,kind:'hero',order:0,heading:'A better class',body:'Enroll today',visible:true});
const item=()=>({id:itemId,order:0,title:'Class 10',description:'Great lessons',mediaId:null,url:'https://example.com/course',visible:true});
const media=()=>({id:mediaId,storageKey:'website/courses/cover.jpg',contentType:'image/jpeg',sizeBytes:5000,sha256:'a'.repeat(64),alt:'Cover photograph'});
const globals=()=>({siteTitle:'Musa Sir Coaching',tagline:'Learn to excel',contactEmail:'info@example.com',contactPhone:null,footerText:'Copyright',logoMediaId:null});
const base=()=>({
  profiles:{[teacherId]:{id:teacherId,displayName:'Musa Teacher',bio:'',phone:null,avatarMediaId:null},[otherId]:{id:otherId,displayName:'Other Teacher',bio:'',phone:null,avatarMediaId:null}},
  prefs:{[teacherId]:{teacherId,theme:'system',locale:'en',emailNotifications:true,pushNotifications:true}},
  pages:{},sections:{},items:{},media:{},global:{draftRevision:1,publishedRevision:null,draft:globals(),published:null},audits:[]
});
function mock(flags={}){
  let state=base();
  function authorized(id){if(flags.denyManager||id!==teacherId)throw Error('CMS_ACCESS_DENIED');}
  function profileActive(id){authorized(id);}
  const port={
    getTeacherProfileAuthorized:async id=>flags.leakProfile?{...structuredClone(state.profiles[id]),role:'teacher'}:structuredClone(state.profiles[id]),
    getTeacherPreferencesAuthorized:async id=>structuredClone(state.prefs[id]),
    assertCanManageWebsite:async id=>authorized(id),
    readPublishedPage:async slug=>{
      const row=Object.values(state.pages).find(p=>p.slug===slug&&p.status==='published'&&p.snapshot);
      if(!row)return null;
      const data={slug,status:row.status,publishedRevision:row.publishedRevision,snapshot:structuredClone(row.snapshot)};
      if(flags.leakPublic)return {...data,draftContent:'secret'};
      if(flags.leakNested) data.snapshot.sections[0].items[0].storageKey='website/private.pdf';
      return data;
    },
    readPublishedGlobal:async()=>state.global.published?structuredClone(state.global.published):null,
    inTransaction:async callback=>{
      const draft=structuredClone(state);
      function owner(id){authorized(id);}
      function assertReady(id){if(draft.media[id]?.status!=='ready')throw Error('MEDIA_NOT_READY');}
      const tx={
        assertCanManageWebsite:async id=>owner(id),
        assertTeacherActive:async id=>profileActive(id),
        assertPublicReadyMedia:async id=>assertReady(id),
        updateTeacherProfile:async(id,patch)=>{draft.profiles[id]={...draft.profiles[id],...patch};return structuredClone(draft.profiles[id]);},
        updateTeacherPreferences:async(id,patch)=>{draft.prefs[id]={...draft.prefs[id],...patch};return structuredClone(draft.prefs[id]);},
        assertSlugAvailable:async slug=>{if(Object.values(draft.pages).some(p=>p.slug===slug))throw Error('SLUG_CONFLICT');},
        insertPageDraft:async p=>{draft.pages[p.id]={...p,snapshot:null};return structuredClone(draft.pages[p.id]);},
        getPageLocked:async id=>structuredClone(draft.pages[id]??null),
        updatePageDraft:async(id,revision,patch)=>{draft.pages[id]={...draft.pages[id],...patch,draftRevision:revision+1};return structuredClone(draft.pages[id]);},
        upsertSectionDraft:async(id,rev,data)=>{
          draft.sections[data.id]={...data,pageId:id};draft.pages[id].draftRevision=rev+1;return structuredClone(draft.sections[data.id]);
        },
        assertSectionInPage:async (id,page)=>{if(draft.sections[id]?.pageId!==page)throw Error('SECTION_PAGE_MISMATCH');},
        assertSectionIdAvailableForPage:async (id,page)=>{if(draft.sections[id]&&draft.sections[id].pageId!==page)throw Error('SECTION_ID_CONFLICT');},
        assertItemIdAvailableForSection:async (id,sectionId)=>{if(draft.items[id]&&draft.items[id].sectionId!==sectionId)throw Error('ITEM_ID_CONFLICT');},
        upsertItemDraft:async(page,sectionId,rev,data)=>{
          draft.items[data.id]={...data,sectionId};draft.pages[page].draftRevision=rev+1;return structuredClone(draft.items[data.id]);
        },
        getPageDraftSnapshotLocked:async id=>{
          const p=draft.pages[id];const sections=Object.values(draft.sections).filter(s=>s.pageId===id&&s.visible).sort((a,b)=>a.order-b.order).map(s=>({
            id:s.id,kind:s.kind,order:s.order,heading:s.heading,body:s.body,
            items:Object.values(draft.items).filter(i=>i.sectionId===s.id&&i.visible).sort((a,b)=>a.order-b.order).map(i=>({id:i.id,order:i.order,title:i.title,description:i.description,mediaId:i.mediaId,url:i.url}))
          }));
          return {schemaVersion:1,slug:p.slug,revision:p.draftRevision,title:p.title,seoTitle:p.seoTitle,seoDescription:p.seoDescription,sections};
        },
        assertSnapshotMediaReady:async snapshot=>{for(const s of snapshot.sections)for(const i of s.items)if(i.mediaId)assertReady(i.mediaId);},
        publishSnapshotAtomic:async(id,rev,snapshot)=>{draft.pages[id]={...draft.pages[id],status:'published',publishedRevision:rev,snapshot:structuredClone(snapshot)};},
        archivePageAtomic:async id=>{draft.pages[id].status='archived';draft.pages[id].snapshot=null;},
        assertUploadedMediaVerified:async m=>{if(flags.badUpload||!m.storageKey.startsWith('website/'))throw Error('UNVERIFIED_STORAGE_UPLOAD');},
        registerMediaReady:async m=>{if(draft.media[m.id])throw Error('MEDIA_EXISTS');draft.media[m.id]={...m,status:'ready'};return structuredClone(draft.media[m.id]);},
        assertMediaNotInPublishedSnapshot:async id=>{if(Object.values(draft.pages).some(p=>p.status==='published'&&p.snapshot?.sections.some(s=>s.items.some(i=>i.mediaId===id))))throw Error('MEDIA_IN_USE');},
        archiveMedia:async id=>{if(!draft.media[id])throw Error('MEDIA_NOT_FOUND');draft.media[id].status='archived';},
        getGlobalSettingsLocked:async()=>structuredClone(draft.global),
        updateGlobalDraft:async(revision,patch)=>{draft.global.draft={...draft.global.draft,...patch};draft.global.draftRevision=revision+1;return structuredClone(draft.global);},
        publishGlobalAtomic:async(revision,snapshot)=>{draft.global.published=structuredClone(snapshot);draft.global.publishedRevision=revision;},
        appendAudit:async event=>{if(flags.failAudit===event.action)throw Error('AUDIT_FAILED');draft.audits.push(event);}
      };
      const result=await callback(tx);state=draft;return result;
    }
  };
  return {cms:createWebsiteCmsOperations(port),settings:createTeacherProfileSettings(port),port,state:()=>structuredClone(state)};
}

test('teacher can update own profile and preferences with audited transactions',async()=>{
  const m=mock();await m.settings.updateMyProfile(teacher,{displayName:' New Teacher ',bio:'Physics teacher',phone:'+880 1712345678'});
  assert.equal((await m.settings.getMyProfile(teacher)).displayName,'New Teacher');
  await m.settings.updateMyPreferences(teacher,{theme:'dark',locale:'bn',emailNotifications:false});
  assert.equal((await m.settings.getMyPreferences(teacher)).theme,'dark');assert.equal(m.state().audits.length,2);
});
test('role/status/email privilege escalation rejected and actor ownership enforced',async()=>{
  const m=mock();await assert.rejects(()=>m.settings.updateMyProfile(teacher,{role:'teacher'}),/INVALID_PROFILE_PATCH/);
  await assert.rejects(()=>m.settings.updateMyProfile(teacher,{email:'a@b.co'}),/INVALID_PROFILE_PATCH/);
  await assert.rejects(()=>m.settings.updateMyPreferences(teacher,{isAdmin:true}),/INVALID_PREFERENCES/);
  await assert.rejects(()=>m.settings.updateMyProfile(student,{displayName:'Another'}),/UNAUTHENTICATED/);
  await assert.rejects(()=>m.settings.updateMyProfile(intruder,{displayName:'Another'}),/CMS_ACCESS_DENIED/);
  assert.equal(m.state().audits.length,0);
});
test('teacher profile leaky data blocked and credential changes require real auth',async()=>{
  const m=mock({leakProfile:true});await assert.rejects(()=>m.settings.getMyProfile(teacher),/DATA_ACCESS_VIOLATION/);
  await assert.rejects(()=>m.settings.requestCredentialChange(teacher),/AUTH_REAUTH_INTEGRATION_REQUIRED/);
  await assert.rejects(()=>createTeacherProfileSettings().updateMyProfile(teacher,{displayName:'abc'}),/PERSISTENCE_PORT_UNAVAILABLE/);
});
test('CMS creates draft and refuses students, unauthorized teachers and duplicate slugs',async()=>{
  const m=mock();await assert.rejects(()=>m.cms.createPageDraft(student,page()),/UNAUTHENTICATED/);
  await assert.rejects(()=>m.cms.createPageDraft(intruder,page()),/CMS_ACCESS_DENIED/);
  await assert.rejects(()=>m.cms.createPageDraft(teacher,{...page(),slug:'../../bad'}),/INVALID_PAGE/);
  await m.cms.createPageDraft(teacher,page());await assert.rejects(()=>m.cms.createPageDraft(teacher,{...page(),id:otherPageId}),/SLUG_CONFLICT/);
  assert.equal(await m.cms.getPublicPage('courses'),null);
});
test('page draft revision is optimistic and stale writes fail closed',async()=>{
  const m=mock();await m.cms.createPageDraft(teacher,page());await m.cms.updatePageDraft(teacher,pageId,1,{title:'New Course List'});
  await assert.rejects(()=>m.cms.updatePageDraft(teacher,pageId,1,{title:'Stale'}),/REVISION_CONFLICT/);
  await assert.rejects(()=>m.cms.updatePageDraft(teacher,pageId,2,{status:'published'}),/INVALID_PAGE_PATCH/);
  assert.equal(m.state().pages[pageId].draftRevision,2);
});
test('CMS builds typed ordered sections/items with strict validation and ownership',async()=>{
  const m=mock();await m.cms.createPageDraft(teacher,page());
  await assert.rejects(()=>m.cms.upsertSectionDraft(teacher,pageId,1,{...section(),kind:'unsafe-html'}),/INVALID_SECTION/);
  await m.cms.upsertSectionDraft(teacher,pageId,1,section());
  await assert.rejects(()=>m.cms.upsertItemDraft(teacher,pageId,secId,1,item()),/REVISION_CONFLICT/);
  await assert.rejects(()=>m.cms.upsertItemDraft(teacher,pageId,otherSecId,2,item()),/SECTION_PAGE_MISMATCH/);
  await assert.rejects(()=>m.cms.upsertItemDraft(teacher,pageId,secId,2,{...item(),url:'javascript:alert(1)'}),/INVALID_SECTION_ITEM/);
  await m.cms.upsertItemDraft(teacher,pageId,secId,2,item());
  assert.equal(m.state().pages[pageId].draftRevision,3);
});
test('media metadata requires verified upload and enforces safe image-only storage',async()=>{
  const m=mock();await assert.rejects(()=>m.cms.registerMediaMetadata(teacher,{...media(),contentType:'image/svg+xml'}),/INVALID_MEDIA/);
  await assert.rejects(()=>m.cms.registerMediaMetadata(teacher,{...media(),storageKey:'website/../../secret.jpg'}),/INVALID_MEDIA/);
  await assert.rejects(()=>m.cms.registerMediaMetadata(teacher,{...media(),sizeBytes:10000000}),/INVALID_MEDIA/);
  await assert.rejects(()=>mock({badUpload:true}).cms.registerMediaMetadata(teacher,media()),/UNVERIFIED_STORAGE_UPLOAD/);
  const row=await m.cms.registerMediaMetadata(teacher,media());assert.equal(row.status,'ready');
});
test('media cannot be referenced before readiness, or used by another section',async()=>{
  const m=mock();await m.cms.createPageDraft(teacher,page());await m.cms.upsertSectionDraft(teacher,pageId,1,section());
  await assert.rejects(()=>m.cms.upsertItemDraft(teacher,pageId,secId,2,{...item(),mediaId}),/MEDIA_NOT_READY/);
  await m.cms.registerMediaMetadata(teacher,media());await m.cms.upsertItemDraft(teacher,pageId,secId,2,{...item(),mediaId});
  assert.equal(m.state().items[itemId].mediaId,mediaId);
});
test('published page only exposes typed released snapshot, not editable draft',async()=>{
  const m=mock();await m.cms.createPageDraft(teacher,page());await m.cms.upsertSectionDraft(teacher,pageId,1,section());await m.cms.upsertItemDraft(teacher,pageId,secId,2,item());
  await m.cms.publishPage(teacher,pageId,3);
  const published=await m.cms.getPublicPage('courses');assert.equal(published.revision,3);assert.equal(published.sections[0].items.length,1);
  await m.cms.updatePageDraft(teacher,pageId,3,{title:'Private unpublished change'});
  assert.equal((await m.cms.getPublicPage('courses')).title,'Our Courses');
  await m.cms.publishPage(teacher,pageId,4);assert.equal((await m.cms.getPublicPage('courses')).title,'Private unpublished change');
});
test('invisible items and sections are excluded from public snapshot',async()=>{
  const m=mock();await m.cms.createPageDraft(teacher,page());await m.cms.upsertSectionDraft(teacher,pageId,1,{...section(),visible:false});
  await m.cms.publishPage(teacher,pageId,2);assert.deepEqual((await m.cms.getPublicPage('courses')).sections,[]);
});
test('public source pollution and nested storage leaks rejected',async()=>{
  const m=mock({leakPublic:true});await m.cms.createPageDraft(teacher,page());await m.cms.publishPage(teacher,pageId,1);
  await assert.rejects(()=>m.cms.getPublicPage('courses'),/DATA_ACCESS_VIOLATION/);
  const n=mock({leakNested:true});await n.cms.createPageDraft(teacher,page());await n.cms.upsertSectionDraft(teacher,pageId,1,section());await n.cms.upsertItemDraft(teacher,pageId,secId,2,item());await n.cms.publishPage(teacher,pageId,3);
  await assert.rejects(()=>n.cms.getPublicPage('courses'),/INVALID_PUBLIC_SNAPSHOT/);
});
test('republishing same version forbidden and archived page becomes unavailable',async()=>{
  const m=mock();await m.cms.createPageDraft(teacher,page());await m.cms.publishPage(teacher,pageId,1);
  await assert.rejects(()=>m.cms.publishPage(teacher,pageId,1),/ALREADY_PUBLISHED/);
  await m.cms.archivePage(teacher,pageId,1);assert.equal(await m.cms.getPublicPage('courses'),null);
  await assert.rejects(()=>m.cms.updatePageDraft(teacher,pageId,1,{title:'Cannot restore'}),/PAGE_NOT_EDITABLE/);
});
test('published media cannot be archived while referenced by public page',async()=>{
  const m=mock();await m.cms.registerMediaMetadata(teacher,media());await m.cms.createPageDraft(teacher,page());await m.cms.upsertSectionDraft(teacher,pageId,1,section());
  await m.cms.upsertItemDraft(teacher,pageId,secId,2,{...item(),mediaId});await m.cms.publishPage(teacher,pageId,3);
  await assert.rejects(()=>m.cms.archiveMedia(teacher,mediaId),/MEDIA_IN_USE/);
  await m.cms.archivePage(teacher,pageId,3);assert.deepEqual(await m.cms.archiveMedia(teacher,mediaId),{id:mediaId,status:'archived'});
});
test('global settings use revisions and unpublished draft remains private',async()=>{
  const m=mock();assert.equal(await m.cms.getPublicGlobal(),null);
  await m.cms.publishGlobal(teacher,1);assert.equal((await m.cms.getPublicGlobal()).siteTitle,'Musa Sir Coaching');
  await assert.rejects(()=>m.cms.publishGlobal(teacher,1),/ALREADY_PUBLISHED/);
  await m.cms.updateGlobalDraft(teacher,1,{siteTitle:'Updated Institution'});
  assert.equal((await m.cms.getPublicGlobal()).siteTitle,'Musa Sir Coaching');
  await assert.rejects(()=>m.cms.updateGlobalDraft(teacher,1,{footerText:'old revision'}),/REVISION_CONFLICT/);
  await m.cms.publishGlobal(teacher,2);assert.equal((await m.cms.getPublicGlobal()).siteTitle,'Updated Institution');
});
test('global settings reject HTML/script settings, unknown keys and unready logo',async()=>{
  const m=mock();await assert.rejects(()=>m.cms.updateGlobalDraft(teacher,1,{role:'teacher'}),/INVALID_GLOBAL_SETTINGS/);
  await assert.rejects(()=>m.cms.updateGlobalDraft(teacher,1,{contactEmail:'bad'}),/INVALID_GLOBAL_SETTINGS/);
  await m.cms.updateGlobalDraft(teacher,1,{logoMediaId:mediaId});await assert.rejects(()=>m.cms.publishGlobal(teacher,2),/MEDIA_NOT_READY/);
  assert.equal(await m.cms.getPublicGlobal(),null);
});
test('audit failure rolls back page, profile, settings and publication atomically',async()=>{
  const a=mock({failAudit:'cms.page.created'});await assert.rejects(()=>a.cms.createPageDraft(teacher,page()),/AUDIT_FAILED/);assert.deepEqual(a.state().pages,{});
  const b=mock({failAudit:'teacher.profile.updated'});await assert.rejects(()=>b.settings.updateMyProfile(teacher,{displayName:'Fail Me'}),/AUDIT_FAILED/);
  assert.equal(b.state().profiles[teacherId].displayName,'Musa Teacher');
  const c=mock({failAudit:'cms.page.published'});await c.cms.createPageDraft(teacher,page());
  await assert.rejects(()=>c.cms.publishPage(teacher,pageId,1),/AUDIT_FAILED/);assert.equal(await c.cms.getPublicPage('courses'),null);
});
test('fail closed without transaction port and with invalid actor',async()=>{
  const cms=createWebsiteCmsOperations();await assert.rejects(()=>cms.createPageDraft(teacher,page()),/PERSISTENCE_PORT_UNAVAILABLE/);
  await assert.rejects(()=>cms.getPublicPage('courses'),/PERSISTENCE_PORT_UNAVAILABLE/);
  const m=mock();await assert.rejects(()=>m.cms.publishGlobal({...teacher,verified:false},1),/UNAUTHENTICATED/);
  await assert.rejects(()=>m.cms.createPageDraft(teacher,{...page(),seoTitle:'x'}),/INVALID_PAGE/);
  await assert.rejects(()=>m.cms.getPublicPage('../x'),/INVALID_SLUG/);
});

test('existing section/item UUID cannot be reassigned to another page or section',async()=>{
  const m=mock();await m.cms.createPageDraft(teacher,page());await m.cms.upsertSectionDraft(teacher,pageId,1,section());
  await m.cms.upsertItemDraft(teacher,pageId,secId,2,item());
  await m.cms.createPageDraft(teacher,{...page(),id:otherPageId,slug:'about'});
  await assert.rejects(()=>m.cms.upsertSectionDraft(teacher,otherPageId,1,section()),/SECTION_ID_CONFLICT/);
  await m.cms.upsertSectionDraft(teacher,otherPageId,1,{...section(),id:otherSecId});
  await assert.rejects(()=>m.cms.upsertItemDraft(teacher,otherPageId,otherSecId,2,item()),/ITEM_ID_CONFLICT/);
  assert.equal(m.state().sections[secId].pageId,pageId);
  assert.equal(m.state().items[itemId].sectionId,secId);
});
