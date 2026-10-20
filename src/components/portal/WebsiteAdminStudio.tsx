'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {cmsFetch,cmsResponseError,CmsRequestError,CMS_KINDS,validateCmsPage,type CmsKind} from '@/client/cms-studio.mjs';
import {SECTION_PRESETS,sectionPreset,cmsEditorialAudit} from '@/client/cms-section-presets.mjs';
import {youtubeVideoId} from '@/client/cms-video.mjs';
import {formForTarget} from '@/client/cms-fields.mjs';
import {StructuredCmsEditor} from './StructuredCmsEditor';
import {CmsLivePreview} from './CmsLivePreview';
import {HomepageSectionMap} from './HomepageSectionMap';
import type {HomeSectionMapping} from '@/client/website-composition.mjs';

type Item={id:string;order:number;title:string;description:string;url:string|null;mediaId:string|null;visible:boolean;metadata?:Record<string,unknown>};
type Section={id:string;kind:CmsKind;order:number;heading:string;body:string;visible:boolean;items:Item[];sectionKey?:string;content?:Record<string,unknown>};
type Page={id:string;slug:string;title:string;seoTitle:string;seoDescription:string;status:string;draftRevision:number;publishedRevision:number|null;sections:Section[]};
type Listing={id:string;slug:string;title:string;status:string;draftRevision:number;publishedRevision:number|null};
type Media={id:string;alt:string;status:string;sizeBytes:number;contentType:string};
type SettingsData={revision:number;publishedRevision:number|null;settings:SiteSettings};
type SiteSettings={siteTitle:string;tagline:string;contactEmail:string;contactPhone:string|null;footerText:string;logoMediaId:string|null};
type Tab='content'|'media'|'settings';
const emptySettings:SiteSettings={siteTitle:'EduCentre',tagline:'',contactEmail:'',contactPhone:null,footerText:'',logoMediaId:null};
const emptySection={kind:'hero' as CmsKind,heading:'',body:'',visible:true};
const emptyItem={title:'',description:'',url:'',visible:true};
const previewLink=(slug:string)=>slug==='home'?'/':`/site/${slug}`;
function errorOf(e:unknown){return e instanceof Error?e.message:'The operation could not be completed.';}
function safeItems(input:unknown):Listing[]{
 const rows=(input as {items?:unknown})?.items;
 if(!Array.isArray(rows)||rows.length>50)throw Error('Invalid CMS page list.');
 return rows.map(x=>{
  const r=x as Partial<Listing>;
  if(!r||typeof r.id!=='string'||typeof r.slug!=='string'||typeof r.title!=='string'||typeof r.draftRevision!=='number')throw Error('Invalid CMS list entry.');
  return r as Listing;
 });
}
function safeMedia(input:unknown):Media[]{
 const rows=(input as {items?:unknown})?.items;
 if(!Array.isArray(rows)||rows.length>100)throw Error('Unexpected media library response.');
 return rows.map(x=>{
  const r=x as Partial<Media>;
  if(!r||typeof r.id!=='string'||typeof r.alt!=='string'||typeof r.status!=='string'||typeof r.contentType!=='string'||typeof r.sizeBytes!=='number')throw Error('Unexpected media record.');
  return r as Media;
 });
}
export function WebsiteAdminStudio({target}:{target?:{id?:string;sectionId?:string;surface?:'home'|'page';schemaKey?:string|null;slug:string|null;kind:string|null;match:string|null;label:string;tab:'content'|'media'|'settings';requestId:number}}){
 const [tab,setTab]=useState<Tab>('content');const [pages,setPages]=useState<Listing[]>([]);const [page,setPage]=useState<Page|null>(null);const [selectedSection,setSelectedSection]=useState('');const [selectedItem,setSelectedItem]=useState('');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [newSlug,setNewSlug]=useState(''),[newTitle,setNewTitle]=useState('');const [title,setTitle]=useState(''),[seoTitle,setSeoTitle]=useState(''),[seoDescription,setSeoDescription]=useState('');
 const [section,setSection]=useState(emptySection),[item,setItem]=useState(emptyItem),[media,setMedia]=useState<Media[]>([]),[selectedMedia,setSelectedMedia]=useState(''),[uploadFile,setUploadFile]=useState<File|null>(null),[imageAlt,setImageAlt]=useState('');
 const [global,setGlobal]=useState<SettingsData|null>(null),[settings,setSettings]=useState<SiteSettings>(emptySettings);
 const [writeStatus,setWriteStatus]=useState<'checking'|'enabled'|'disabled'|'unavailable'|'unauthenticated'|'forbidden'>('checking');
 const [persisted,setPersisted]=useState(false);
 const [typedDirty,setTypedDirty]=useState(false);
 const [visualKey,setVisualKey]=useState<string|null>(null),[typedPreview,setTypedPreview]=useState<{sectionId:string;itemId:string;key:string;value:Record<string,unknown>}|null>(null);
 const statusSequence=useRef(0),mutationBusy=useRef(false),appliedSectionTarget=useRef('');
 const selection=useRef(0);const handledTarget=useRef<number|null>(null);const selected=page?.sections.find(s=>s.id===selectedSection);const content=selected?.items.find(i=>i.id===selectedItem);
 const audit=cmsEditorialAudit(page);const editingGuide=sectionPreset(section.kind);
 const unsaved=typedDirty||Boolean(!selected&&(section.heading||section.body))||Boolean(!content&&(item.title||item.description||item.url))||Boolean(page&&(title!==page.title||seoTitle!==page.seoTitle||seoDescription!==page.seoDescription||selected&&(section.kind!==selected.kind||section.heading!==selected.heading||section.body!==selected.body||section.visible!==selected.visible)||content&&(item.title!==content.title||item.description!==content.description||item.url!==(content.url??'')||item.visible!==content.visible)));
 const canPublish=Boolean(page&&page.draftRevision!==page.publishedRevision&&!unsaved&&writeStatus==='enabled'&&!busy);
 const previewPage=page?{...page,title,sections:page.sections.map(s=>s.id===selectedSection?{...s,...section,...(typedPreview?.sectionId===s.id&&!typedPreview.itemId?{sectionKey:typedPreview.key,content:typedPreview.value}:{}),items:s.items.map(i=>i.id===selectedItem?{...i,...item,url:item.url||null,...(typedPreview?.itemId===i.id?{metadata:typedPreview.value}:{})}:i)}:s)}:null;

 // Load write readiness after mounting, without a synchronous effect state update.
 // Cancellation prevents stale server checks from updating the editor after navigation.
 const checkWriteStatus=useCallback(async(signal?:AbortSignal)=>{
  const sequence=++statusSequence.current;
  try{
   const response=await fetch('/api/v1/teacher/website/write-status',{cache:'no-store',credentials:'same-origin',signal});
   const json:unknown=await response.json();
   if(signal?.aborted||sequence!==statusSequence.current)return;
   if(response.status===401){setWriteStatus('unauthenticated');return;}
   if(response.status===403){setWriteStatus('forbidden');return;}
   if(!response.ok||!json||typeof json!=='object'||Reflect.get(json,'success')!==true)throw Error('WRITE_STATUS_UNAVAILABLE');
   const data=Reflect.get(json,'data');
   if(!data||typeof data!=='object'||typeof Reflect.get(data,'writable')!=='boolean')throw Error('WRITE_STATUS_INVALID');
   setWriteStatus(Reflect.get(data,'writable')?'enabled':'disabled');
  }catch{if(!signal?.aborted&&sequence===statusSequence.current)setWriteStatus('unavailable');}
 },[]);
 useEffect(()=>{
  const controller=new AbortController();
  void Promise.resolve().then(()=>{
   if(!controller.signal.aborted)void checkWriteStatus(controller.signal);
  });
  return()=>controller.abort();
 },[checkWriteStatus]);
 const refreshPages=useCallback(async()=>{setPages(safeItems(await cmsFetch('pages')));},[]);
 const refreshMedia=useCallback(async()=>{setMedia(safeMedia(await cmsFetch('media')));},[]);
 const refreshSettings=useCallback(async()=>{
  const next=await cmsFetch('settings') as SettingsData;
  if(!next||typeof next.revision!=='number'||!next.settings||typeof next.settings.siteTitle!=='string')throw Error('Invalid global settings response.');
  setGlobal(next);setSettings({...next.settings});
 },[]);
 const choosePage=useCallback(async(id:string,preserve=false)=>{
  const seq=++selection.current;
  setBusy(true);setError('');setNotice('');
  try{
   const next=validateCmsPage(await cmsFetch('page',{pageId:id})) as Page;
   if(seq!==selection.current)return;
   setPage(next);setTitle(next.title);setSeoTitle(next.seoTitle);setSeoDescription(next.seoDescription);setTypedDirty(false);setTypedPreview(null);
   if(!preserve){setSelectedSection('');setSelectedItem('');setSection(emptySection);setItem(emptyItem);setTypedPreview(null);setVisualKey(null);}
   return next;
  }catch(e){if(seq===selection.current)setError(errorOf(e));}finally{if(seq===selection.current)setBusy(false);}
 },[]);
 useEffect(()=>{
  let active=true;
  Promise.allSettled([cmsFetch('pages'),cmsFetch('media'),cmsFetch('settings')]).then(([p,m,g])=>{
   if(!active)return;
   const failed:string[]=[];
   try{if(p.status==='fulfilled')setPages(safeItems(p.value));else failed.push('page list');}catch{failed.push('page list');}
   try{if(m.status==='fulfilled')setMedia(safeMedia(m.value));else failed.push('media');}catch{failed.push('media');}
   try{
    if(g.status!=='fulfilled')throw Error('Settings unavailable');
    const d=g.value as SettingsData;
    if(!d||typeof d.revision!=='number'||!d.settings||typeof d.settings.siteTitle!=='string')throw Error('Invalid settings');
    setGlobal(d);setSettings({...d.settings});
   }catch{failed.push('global settings');}
   if(failed.length)setError(`Some CMS tools could not load (${failed.join(', ')}). Other sections may still work. Check local database permissions and migrations.`);
  }).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;selection.current++;};
 },[]);
 // React effects identify navigation targets; state updates are dispatched after the effect
 // via a cancellable microtask, so stale sidebar selections cannot overwrite a newer one.
 useEffect(()=>{
  if(!target||handledTarget.current===target.requestId||loading)return;
  let found:Listing|undefined;
  if(target.slug){found=pages.find(p=>p.slug===target.slug);if(!found)return;}
  let active=true;
  void Promise.resolve().then(()=>{
   if(!active||handledTarget.current===target.requestId)return;
   handledTarget.current=target.requestId;
   setTab(target.tab);
   if(found)void choosePage(found.id);
  });
  return()=>{active=false;};
 },[target,pages,loading,choosePage]);
 useEffect(()=>{
  if(!target||!page||target.slug!==page.slug||tab!=='content'||!target.kind)return;
  const key=`${target.requestId}:${page.id}`;
  if(appliedSectionTarget.current===key)return;
  const options=page.sections.filter(s=>s.kind===target.kind);
  const semanticKey=target.schemaKey??formForTarget(target);
  const found=options.find(s=>s.id===target.sectionId)??options.find(s=>s.sectionKey===semanticKey)??(target.match?options.find(s=>!s.sectionKey&&s.heading.toLowerCase().includes(target.match!.toLowerCase())):options.find(s=>!s.sectionKey));
  let active=true;
  void Promise.resolve().then(()=>{
   if(!active)return;
   appliedSectionTarget.current=key;
   if(found){setSelectedSection(found.id);setSelectedItem('');setSection({kind:found.kind,heading:found.heading,body:found.body,visible:found.visible});}
   else{setSelectedSection('');setSelectedItem('');setSection({kind:target.kind as CmsKind,heading:target.label,body:'',visible:true});}
  });
  return()=>{active=false;};
 },[page,target,tab]);
 const run=async(operation:()=>Promise<unknown>,nextId:string|null=page?.id??null,refreshAsset=false,message='Draft saved and read back from Supabase. Publish separately to update the public website.')=>{
  if(mutationBusy.current)return;
  if(writeStatus!=='enabled'){setError('Write access is not ready. Recheck backend access before saving.');return;}
  mutationBusy.current=true;
  setBusy(true);setError('');setNotice('');
  try{await operation();await Promise.all([refreshPages(),...(refreshAsset?[refreshMedia()]:[])]);if(nextId){const next=await choosePage(nextId,nextId===page?.id);if(!next)throw Error('The server accepted the operation, but read-back failed. Reload before retrying.');}setPersisted(true);setNotice(message);}
  catch(e){setError(errorOf(e));if(e instanceof CmsRequestError){if(e.code==='MUTATIONS_DISABLED')setWriteStatus('disabled');else if(e.status===401)setWriteStatus('unauthenticated');else if(e.status===403)setWriteStatus('forbidden');else if(e.status>=500)setWriteStatus('unavailable');}}finally{mutationBusy.current=false;setBusy(false);}
 };
 async function chooseVisual(mapping:HomeSectionMapping){const source=pages.find(p=>p.slug===(mapping.available?mapping.sourceSlug:'home'));if(!source){setError('Create the source page before editing this section.');return;}const next=await choosePage(source.id);if(!next)return;setVisualKey(mapping.key);const found=next.sections.find(s=>s.id===mapping.section?.id);if(found){setSelectedSection(found.id);setSelectedItem('');setSection({kind:found.kind,heading:found.heading,body:found.body,visible:found.visible});}else{setSelectedSection('');setSection({kind:mapping.kind as CmsKind,heading:mapping.label,body:'',visible:true});}}
 function editSection(s:Section){setSelectedSection(s.id);setSelectedItem('');setSection({kind:s.kind,heading:s.heading,body:s.body,visible:s.visible});}
 function editItem(s:Section,i:Item){setSelectedSection(s.id);setSelectedItem(i.id);setSection({kind:s.kind,heading:s.heading,body:s.body,visible:s.visible});setItem({title:i.title,description:i.description,url:i.url||'',visible:i.visible});}
 const saveSection=(e:FormEvent)=>{e.preventDefault();if(!page)return;const sid=selectedSection||crypto.randomUUID();const rank=selected?.order??(page.sections.length?Math.max(...page.sections.map(s=>s.order))+1:0);void run(async()=>{const saved=await cmsFetch('section',{pageId:page.id,sectionId:sid,payload:{expectedRevision:page.draftRevision,order:rank,...section}});setSelectedSection(sid);return saved;});};
 const saveItem=(e:FormEvent)=>{e.preventDefault();if(!page||!selected)return;const id=selectedItem||crypto.randomUUID();const rank=content?.order??(selected.items.length?Math.max(...selected.items.map(i=>i.order))+1:0);void run(()=>cmsFetch('item',{pageId:page.id,sectionId:selected.id,itemId:id,payload:{expectedRevision:page.draftRevision,order:rank,title:item.title,description:item.description,url:item.url.trim()||null,visible:item.visible}}));};
 const makePage=(e:FormEvent)=>{e.preventDefault();const id=crypto.randomUUID();void run(()=>cmsFetch('pageCreate',{payload:{id,slug:newSlug.trim(),title:newTitle.trim(),seoTitle:newTitle.trim(),seoDescription:''}}),id);};
 const moveContent=(sectionId:string|null,ids:string[],index:number,direction:number)=>{
  if(!page||index+direction<0||index+direction>=ids.length)return;
  const ordered=ids.slice();[ordered[index],ordered[index+direction]]=[ordered[index+direction],ordered[index]];
  void run(()=>cmsFetch('organize',{pageId:page.id,payload:{action:sectionId?'items.reorder':'sections.reorder',sectionId,itemId:null,orderIds:ordered,expectedRevision:page.draftRevision}}));
 };
 const publish=()=>{if(!page||!canPublish||!window.confirm(`Publish /${page.slug} revision ${page.draftRevision}? The website becomes publicly visible.`))return;void run(async()=>{
  await cmsFetch('publish',{pageId:page.id,payload:{expectedRevision:page.draftRevision}});
  const response=await fetch(`/api/v1/public/site-pages/${encodeURIComponent(page.slug)}`,{cache:'no-store'});
  const result=await response.json();
  if(!response.ok||result?.success!==true||result.data?.revision!==page.draftRevision)throw Error('Publication was accepted, but public read-back did not confirm the revision. Reload before retrying.');
 },page.id,false,'Published revision confirmed through the public API. Visitors receive the published content.');};
 const archive=()=>{if(!page||!window.confirm(`Archive /${page.slug}? Visitors will no longer see this page.`))return;const archived=page.id;void run(async()=>{await cmsFetch('archive',{pageId:archived,payload:{expectedRevision:page.draftRevision}});setPage(null);},null,false,'Page archived. It is no longer publicly available.');};
 async function upload(){if(!uploadFile||imageAlt.trim().length<2||imageAlt.trim().length>200)throw Error('Choose a valid image and descriptive alt text.');
  if(!['image/jpeg','image/png','image/webp','image/avif'].includes(uploadFile.type)||uploadFile.size>5*1024*1024||uploadFile.size===0)throw Error('Upload JPEG, PNG, WebP or AVIF up to 5 MiB.');
  const res=await fetch('/api/v1/teacher/website/media/upload',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':uploadFile.type,'Idempotency-Key':crypto.randomUUID(),'x-musa-ui':'1','x-media-id':crypto.randomUUID(),'x-media-alt':imageAlt.trim()},body:uploadFile});
  const json:unknown=await res.json();if(!res.ok)throw cmsResponseError(res.status,json);
  if(!json||typeof json!=='object'||Reflect.get(json,'success')!==true)throw Error('Invalid upload response.');
 }
 const updateSettings=(e:FormEvent)=>{e.preventDefault();if(!global)return;void run(async()=>{await cmsFetch('settingsUpdate',{payload:{expectedRevision:global.revision,settings}});await refreshSettings();},null);};
 const publishSettings=()=>{if(!global||global.revision===global.publishedRevision||JSON.stringify(settings)!==JSON.stringify(global.settings)||!window.confirm('Publish global website settings?'))return;void run(async()=>{await cmsFetch('settingsPublish',{payload:{expectedRevision:global.revision}});await refreshSettings();},null,false,'Global website settings published and read back from Supabase.');};
 return <div className="studio-shell">
  <header className="studio-header"><div><span className="portal-kicker">WEBSITE ADMIN · CONTENT CONTROL</span><h2>Website Studio</h2><p>Edit real Supabase records with safe draft revisions, media and publishing. No local content database.</p></div><div className="studio-head-actions"><Link className="portal-secondary" href="/" target="_blank">View live website ↗</Link>{page&&<button className="portal-primary" disabled={!canPublish} title={unsaved?'Save your field changes as a draft first':page.draftRevision===page.publishedRevision?'This saved revision is already published':undefined} onClick={publish}>Publish page ↗</button>}</div></header>

  <div className={'studio-write-status studio-write-status-'+writeStatus} role="status" aria-live="polite">
   <div><strong>{writeStatus==='enabled'?(persisted?'Database mutation confirmed this session':'Write gate enabled · CMS read service reachable'):writeStatus==='disabled'?'Editor is in read-only server mode':writeStatus==='checking'?'Checking backend write readiness…':writeStatus==='unauthenticated'?'Sign in again to edit':writeStatus==='forbidden'?'Active Teacher access required':'CMS backend could not be reached'}</strong>
   <p>{writeStatus==='enabled'?(persisted?'The server confirmed an operation and the editor read back the persisted data. Each further edit still requires authorization and revision checks.':'The runtime gate and an authenticated CMS read passed. Write permissions and persistence are verified only after a successful save.'):writeStatus==='disabled'?'Your running Next.js process has the reviewed mutation gate OFF. Close the old server and start RUN_EDUCENTRE_DEV_WRITES.ps1 -Start in the project root. Do not reset Supabase or modify RLS.':writeStatus==='checking'?'Checking the running server—not a different PowerShell terminal.':'Recheck access after resolving the session, permissions or backend availability.'}</p></div>
   <button type="button" className="portal-secondary" onClick={()=>void checkWriteStatus()}>Recheck write access ↻</button>
  </div>
  <div className="studio-stepper"><span>01 · Compose</span><span>02 · Preview draft</span><span>03 · Publish</span></div>
  <nav className="studio-tabs" aria-label="Website admin sections"><button onClick={()=>{handledTarget.current=target?.requestId??null;setTab('content');}} aria-current={tab==='content'?'page':undefined}>Pages & sections</button><button onClick={()=>{handledTarget.current=target?.requestId??null;setTab('media');}} aria-current={tab==='media'?'page':undefined}>Media library</button><button onClick={()=>{handledTarget.current=target?.requestId??null;setTab('settings');}} aria-current={tab==='settings'?'page':undefined}>Global settings</button></nav>
  {error&&<div className="portal-alert" role="alert">{error}</div>}{notice&&<div className="portal-success" role="status">{notice}</div>}
  {page&&<p className="studio-hint" role="status">{unsaved?'Unsaved field changes. Save the edited section, item or metadata before publishing.':page.draftRevision===page.publishedRevision?'This saved revision is already published. Edit a field and save a draft to make a new revision.':'Saved draft changes are ready to publish.'}</p>}
  {loading?<div className="portal-loading">Loading secure CMS data…</div>:tab==='settings'?<div className="studio-content-single"><div className="portal-panel"><h3>Global website identity</h3><p className="portal-muted">Site title, tagline, contact details and footer are controlled here. Save draft, then publish.</p><form className="studio-form" onSubmit={updateSettings}>
   <div className="portal-form-grid"><label>Site name<input required minLength={2} maxLength={160} value={settings.siteTitle} onChange={e=>setSettings({...settings,siteTitle:e.target.value})}/></label><label>Tagline<input maxLength={160} value={settings.tagline} onChange={e=>setSettings({...settings,tagline:e.target.value})}/></label><label>Contact email<input type="email" required maxLength={254} value={settings.contactEmail} onChange={e=>setSettings({...settings,contactEmail:e.target.value})}/></label><label>Contact phone<input maxLength={20} value={settings.contactPhone||''} onChange={e=>setSettings({...settings,contactPhone:e.target.value||null})}/></label></div><label>Footer text<textarea rows={3} maxLength={1000} value={settings.footerText} onChange={e=>setSettings({...settings,footerText:e.target.value})}/></label>
   <label>Website logo<select aria-label="Website logo" value={settings.logoMediaId??''} onChange={e=>setSettings({...settings,logoMediaId:e.target.value||null})}><option value="">EduCentre letter mark</option>{media.filter(m=>m.status==='ready').map(m=><option key={m.id} value={m.id}>{m.alt}</option>)}</select></label><p className="studio-hint">Choose a verified image from the media library. The draft logo remains private until settings are published.</p><div className="studio-actions"><small>Draft revision: {global?.revision??'—'} · Published: {global?.publishedRevision??'none'}</small><button className="portal-secondary" disabled={busy}>Save draft</button><button type="button" className="portal-primary" disabled={busy||!global?.revision||global.revision===global.publishedRevision||JSON.stringify(settings)!==JSON.stringify(global.settings)} onClick={publishSettings}>Publish settings</button></div></form></div></div>:tab==='media'?<div className="studio-content-single"><div className="portal-panel"><h3>Verified image library</h3><p className="portal-muted">Images remain private until attached to a published CMS item. Storage and signed authorization are enforced server-side.</p><form className="studio-form" onSubmit={e=>{e.preventDefault();void run(upload,page?.id,true);}}><div className="portal-form-grid"><label>Image<input required type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={e=>setUploadFile(e.target.files?.[0]||null)}/></label><label>Alternative text<input required minLength={2} maxLength={200} value={imageAlt} onChange={e=>setImageAlt(e.target.value)} placeholder="Describe the photograph"/></label></div><button className="portal-primary" disabled={busy}>Upload image safely</button></form><div className="studio-media-grid">{media.map(m=><div key={m.id} className="studio-media-card"><strong>{m.alt}</strong><small>{m.contentType} · {Math.ceil(m.sizeBytes/1024)} KB</small><span className="studio-pill">{m.status}</span>{m.status==='ready'&&<button type="button" className="portal-secondary" disabled={busy} onClick={()=>{if(window.confirm(`Archive ${m.alt}? Content attachments must be removed first.`))void run(()=>cmsFetch('mediaArchive',{mediaId:m.id}),null,true,'Image archived and library refreshed.');}}>Archive image</button>}</div>)}{media.length===0&&<div className="studio-muted">No uploaded images yet.</div>}</div></div></div>:
  <div className="studio-layout"><aside className="studio-page-nav"><div className="studio-page-heading"><h3>Site pages</h3><span>{pages.length}</span></div>{pages.map(p=><button key={p.id} className={'studio-page-entry '+(page?.id===p.id?'active':'')} disabled={busy} onClick={()=>void choosePage(p.id)}><strong>{p.title}</strong><small>/{p.slug} · {p.status}</small></button>)}<form className="studio-form studio-create" onSubmit={makePage}><h4>+ New page</h4><label>Slug<input required pattern="[a-z][a-z0-9-]{1,62}" value={newSlug} onChange={e=>setNewSlug(e.target.value)} placeholder="about"/></label><label>Title<input required minLength={2} maxLength={160} value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="About us"/></label><button className="portal-primary" disabled={busy}>Create draft page</button></form></aside>
  <div className="studio-main"><HomepageSectionMap onChoose={mapping=>void chooseVisual(mapping)}/>{!page?<div className="studio-welcome"><span>✦</span><h3>Build a remarkable website.</h3><p>Select a page or create one, then edit its content using structured sections.</p></div>:<>
  {target?.slug===page.slug&&target.kind&&!page.sections.some(s=>s.kind===target.kind&&(!target.match||s.heading.toLowerCase().includes(target.match.toLowerCase())))&&<p className="studio-dependency-note" role="status">
The reference section <b>{target.label}</b> has no dedicated record on this page yet. The secure editor below is prepared for a new {target.kind} section. Create the section, then complete its dedicated structured fields below. Save a draft before publishing.
</p>}
{target?.slug===page.slug&&target.kind&&page.sections.some(s=>s.kind===target.kind&&(!target.match||s.heading.toLowerCase().includes(target.match.toLowerCase())))&&<p className="studio-dependency-note">Editing <b>{target.label}</b> through the shared Supabase CMS. <b>◐</b> marks fields not yet mapped one-to-one from the reference.</p>}
<div className="studio-page-actions"><div><span className="portal-kicker">/{page.slug} · {page.status}</span><h3>{page.title}</h3><small>Draft revision {page.draftRevision} · Published revision {page.publishedRevision??'none'}</small></div><div><button className="portal-secondary" onClick={()=>{setSelectedSection('');setSelectedItem('');setSection(emptySection);setItem(emptyItem);}}>+ Add section</button><button className="portal-secondary studio-danger" disabled={busy} onClick={archive}>Archive</button></div></div>
  <details className="studio-expansion"><summary>Page details & SEO</summary><form className="studio-form" onSubmit={e=>{e.preventDefault();void run(()=>cmsFetch('pageUpdate',{pageId:page.id,payload:{expectedRevision:page.draftRevision,title,seoTitle,seoDescription}}));}}><div className="portal-form-grid"><label>Page title<input required maxLength={160} minLength={2} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>SEO title<input required maxLength={160} minLength={2} value={seoTitle} onChange={e=>setSeoTitle(e.target.value)}/></label></div><label>SEO description<textarea maxLength={300} rows={2} value={seoDescription} onChange={e=>setSeoDescription(e.target.value)}/></label><button disabled={busy} className="portal-secondary">Save page metadata</button></form></details>
  <div className="studio-editorial-audit" aria-label="Publication readiness suggestions"><div><strong>Editorial checklist</strong><small>{audit.score}/{audit.checks.length} suggestions complete · informational only</small></div><ul>{audit.checks.map(c=><li key={c.key} className={c.ok?"ready":"needs-work"}><span aria-hidden="true">{c.ok?"✓":"○"}</span> {c.label}</li>)}</ul></div>
  <div className="studio-section-list">{[...page.sections].sort((a,b)=>a.order-b.order).map((s,index,ordered)=><div key={s.id} className={'studio-section-row '+(!s.visible?'studio-hidden':'')}>
   <button className="studio-section-select" onClick={()=>editSection(s)}><span><strong>{s.heading||s.kind}</strong><small>{s.kind} / {s.items.length} items / {s.visible?'visible':'hidden'}</small></span><span>Edit</span></button>
   <div className="studio-actions"><button type="button" className="portal-secondary" disabled={busy||index===0} aria-label={`Move section ${s.heading||s.kind} up`} onClick={()=>moveContent(null,ordered.map(x=>x.id),index,-1)}>Move up</button><button type="button" className="portal-secondary" disabled={busy||index===ordered.length-1} aria-label={`Move section ${s.heading||s.kind} down`} onClick={()=>moveContent(null,ordered.map(x=>x.id),index,1)}>Move down</button></div>
   {s.items.slice().sort((a,b)=>a.order-b.order).map((i,itemIndex,orderedItems)=><div key={i.id}><button className="studio-item-select" onClick={()=>editItem(s,i)}><span>{i.title||'Untitled content item'}</span><span>{i.visible?'Edit':'Hidden / Edit'}</span></button><div className="studio-actions"><button type="button" className="portal-secondary" disabled={busy||itemIndex===0} aria-label={`Move item ${i.title} up`} onClick={()=>moveContent(s.id,orderedItems.map(x=>x.id),itemIndex,-1)}>Move up</button><button type="button" className="portal-secondary" disabled={busy||itemIndex===orderedItems.length-1} aria-label={`Move item ${i.title} down`} onClick={()=>moveContent(s.id,orderedItems.map(x=>x.id),itemIndex,1)}>Move down</button></div></div>)}
  </div>)}</div>
  <div className="studio-editor-panel"><div className="studio-editor-head"><span className="portal-kicker">{selectedItem?'ITEM EDITOR':selectedSection?'SECTION EDITOR':'NEW SECTION'}</span><button className="portal-secondary" onClick={()=>{setSelectedSection('');setSelectedItem('');setSection(emptySection);setItem(emptyItem);}}>New section</button></div>
  {!selectedSection&&<div className="studio-presets" aria-label="Choose a content section blueprint"><strong>Start with a section blueprint</strong><div className="studio-preset-grid">{SECTION_PRESETS.map(p=><button key={p.kind} type="button" className={section.kind===p.kind?"studio-preset active":"studio-preset"} onClick={()=>setSection({kind:p.kind as CmsKind,heading:p.heading,body:"",visible:true})}>{p.label}</button>)}</div></div>}
  {editingGuide&&<p className="studio-kind-guide">{editingGuide.hint}</p>}
  <form className="studio-form" onSubmit={saveSection}><div className="portal-form-grid"><label>Section type<select value={section.kind} onChange={e=>setSection({...section,kind:e.target.value as CmsKind})}>{CMS_KINDS.map(k=><option key={k} value={k}>{k.replaceAll('-',' ')}</option>)}</select></label><label>Heading<input maxLength={160} value={section.heading} onChange={e=>setSection({...section,heading:e.target.value})}/></label></div><label>Description / paragraph<textarea rows={3} maxLength={6000} value={section.body} onChange={e=>setSection({...section,body:e.target.value})}/></label><label className="studio-check"><input type="checkbox" checked={section.visible} onChange={e=>setSection({...section,visible:e.target.checked})}/> Show this section publicly after publishing</label><button className="portal-primary" disabled={busy}>{selectedSection?'Save section changes':'Add section'}</button></form>
  {selected&&<form className="studio-form studio-form-separated" onSubmit={saveItem}><div className="studio-editor-head"><h4>{selectedItem?'Edit content item':'Add content item'}</h4>{selectedItem&&<button type="button" className="portal-secondary" onClick={()=>{setSelectedItem('');setItem(emptyItem);}}>New item</button>}</div><div className="portal-form-grid"><label>Item title<input maxLength={160} value={item.title} onChange={e=>setItem({...item,title:e.target.value})}/></label><label>HTTPS link / YouTube video URL<input type="url" value={item.url} onChange={e=>setItem({...item,url:e.target.value})} placeholder="https://"/></label></div><label>Item description<textarea maxLength={2000} rows={3} value={item.description} onChange={e=>setItem({...item,description:e.target.value})}/></label>{item.url&&youtubeVideoId(item.url)&&<p className="studio-video-guide" role="status">Video recognized. After saving and publishing, viewers can play this YouTube video on the public page. No upload or private draft playback occurs.</p>}
   <label className="studio-check"><input type="checkbox" checked={item.visible} onChange={e=>setItem({...item,visible:e.target.checked})}/> Show this item publicly after publishing</label><button className="portal-primary" disabled={busy}>{selectedItem?'Save item':'Add item'}</button></form>}
  {selected&&<StructuredCmsEditor key={`${selected.id}:${page.draftRevision}:${selectedItem}`} sectionKey={selected.sectionKey} suggestedKey={visualKey??target?.schemaKey??formForTarget(target)} kind={selected.kind} value={content?.metadata??selected.content??((visualKey??target?.schemaKey)==='HOME_HERO'?{headline:selected.heading,description:selected.body}:{})} item={Boolean(content)} busy={busy} media={media} onDirty={()=>setTypedDirty(true)} onPreview={(key,value)=>setTypedPreview({sectionId:selected.id,itemId:selectedItem,key,value})} onSave={(key,value)=>{void run(()=>cmsFetch('fields',{pageId:page.id,sectionId:selected.id,payload:{sectionKey:key,content:value,itemId:content?.id??null,expectedRevision:page.draftRevision}}));}}/>}
  {selectedItem&&content&&<div className="studio-media-attach"><h4>Attach verified image</h4><div className="portal-form-grid"><label>Image<select value={selectedMedia} onChange={e=>setSelectedMedia(e.target.value)}><option value="">Choose image</option>{media.filter(m=>m.status==='ready').map(m=><option value={m.id} key={m.id}>{m.alt}</option>)}</select></label><label>Current media<output>{content.mediaId?'Image attached':'None'}</output></label></div><button className="portal-secondary" disabled={!selectedMedia||busy} onClick={()=>{if(!page)return;void run(()=>cmsFetch('attach',{pageId:page.id,itemId:content.id,mediaId:selectedMedia,payload:{mediaId:selectedMedia,expectedRevision:page.draftRevision}}));}}>Attach to draft</button>{content.mediaId&&<button type="button" className="portal-secondary" disabled={busy} onClick={()=>void run(()=>cmsFetch('organize',{pageId:page.id,payload:{action:'media.detach',sectionId:null,itemId:content.id,orderIds:null,expectedRevision:page.draftRevision}}))}>Remove image from draft</button>}</div>}
  <p className="studio-hint">Each section and item has its own visibility setting. Text, links and verified images are editable; changes appear publicly only after publishing. Published YouTube links get click-to-play public cards. Custom item icons, video file uploads are not part of the current secured database contract.</p></div>
  </>}</div><aside className="studio-preview"><div className="studio-preview-head"><strong>Live draft preview</strong><small>Local view, unpublished</small></div>{page?<><CmsLivePreview draft={previewPage??page} settings={{revision:global?.revision??0,settings}} surface={target?.surface==='home'||visualKey||target?.id?.startsWith('home-page-')?'home':'page'}/><Link href={previewLink(page.slug)} target="_blank" className="portal-secondary studio-preview-link">View published page ↗</Link></>:<div className="studio-muted">Choose a page to preview.</div>}</aside></div>}
 </div>;
}
