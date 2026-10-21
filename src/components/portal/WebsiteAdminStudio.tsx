'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';

import {cmsFetch,cmsResponseError,CmsRequestError,validateCmsPage,type CmsKind} from '@/client/cms-studio.mjs';


import {formForTarget} from '@/client/cms-fields.mjs';



import {saveCmsDraft,type CmsDraftStep} from '@/client/cms-save-draft.mjs';

import {CmsContextWorkspace} from './CmsContextWorkspace';
import type {CmsNode} from '@/client/cms-tree.mjs';

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
 const [contextFocus,setContextFocus]=useState<CmsNode|null>(null);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [title,setTitle]=useState(''),[seoTitle,setSeoTitle]=useState(''),[seoDescription,setSeoDescription]=useState('');
 const [section,setSection]=useState(emptySection),[item,setItem]=useState(emptyItem),[media,setMedia]=useState<Media[]>([]);
 const [global,setGlobal]=useState<SettingsData|null>(null),[settings,setSettings]=useState<SiteSettings>(emptySettings);
 const [writeStatus,setWriteStatus]=useState<'checking'|'enabled'|'disabled'|'unavailable'|'unauthenticated'|'forbidden'>('checking');
 const [writeRuntime,setWriteRuntime]=useState<'local-development'|'deployment'>('local-development');
 const [typedDirty,setTypedDirty]=useState(false);
 const [typedPreview,setTypedPreview]=useState<{sectionId:string;itemId:string;key:string;value:Record<string,unknown>}|null>(null);
 const statusSequence=useRef(0),mutationBusy=useRef(false),appliedSectionTarget=useRef('');
 const selection=useRef(0);const handledTarget=useRef<number|null>(null);const selected=page?.sections.find(s=>s.id===selectedSection);const content=selected?.items.find(i=>i.id===selectedItem);
 const settingsDirty=Boolean(global&&JSON.stringify(settings)!==JSON.stringify(global.settings));
 const unsaved=settingsDirty||typedDirty||Boolean(!selected&&(section.heading||section.body))||Boolean(!content&&(item.title||item.description||item.url))||Boolean(page&&(title!==page.title||seoTitle!==page.seoTitle||seoDescription!==page.seoDescription||selected&&(section.kind!==selected.kind||section.heading!==selected.heading||section.body!==selected.body||section.visible!==selected.visible)||content&&(item.title!==content.title||item.description!==content.description||item.url!==(content.url??'')||item.visible!==content.visible)));
 const canPublish=Boolean(page&&page.draftRevision!==page.publishedRevision&&!unsaved&&writeStatus==='enabled'&&!busy);
 const previewPage=page?{...page,title,sections:page.sections.map(s=>s.id===selectedSection?{...s,...section,...(typedPreview?.sectionId===s.id&&!typedPreview.itemId?{sectionKey:typedPreview.key,content:typedPreview.value}:{}),items:s.items.map(i=>i.id===selectedItem?{...i,...item,url:item.url||null,...(typedPreview?.itemId===i.id?{metadata:typedPreview.value}:{})}:i)}:s)}:null;

 useEffect(()=>{if(!unsaved)return;const before=(event:BeforeUnloadEvent)=>{event.preventDefault();};const navigate=(event:MouseEvent)=>{const target=event.target instanceof Element?event.target.closest('.portal-workspace-switch button,.portal-signout,.portal-mobile-logout'):null;if(target&&!window.confirm('Discard unsaved website edits?')){event.preventDefault();event.stopPropagation();}};window.addEventListener('beforeunload',before);document.addEventListener('click',navigate,true);return()=>{window.removeEventListener('beforeunload',before);document.removeEventListener('click',navigate,true);};},[unsaved]);
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

   setWriteRuntime(Reflect.get(data,'runtime')==='deployment'?'deployment':'local-development');
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
   if(!preserve){setSelectedSection('');setSelectedItem('');setSection(emptySection);setItem(emptyItem);setTypedPreview(null);setContextFocus({id:'page:'+next.id,pageId:next.id,label:next.title,type:'page'});}
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

   if(found){setContextFocus({id:'section:'+found.id,pageId:page.id,sectionId:found.id,type:'section',label:found.heading||target.label});setSelectedSection(found.id);setSelectedItem('');setSection({kind:found.kind,heading:found.heading,body:found.body,visible:found.visible});}
   else{setSelectedSection('');setSelectedItem('');setSection({kind:target.kind as CmsKind,heading:target.label,body:'',visible:true});}
  });
  return()=>{active=false;};
 },[page,target,tab]);
 const run=async(operation:()=>Promise<unknown>,nextId:string|null=page?.id??null,refreshAsset=false,message='Draft saved and read back from Supabase. Publish separately to update the public website.')=>{
  if(mutationBusy.current)return;
  if(writeStatus!=='enabled'){setError('Write access is not ready. Recheck backend access before saving.');return;}
  mutationBusy.current=true;
  setBusy(true);setError('');setNotice('');
  try{await operation();await Promise.all([refreshPages(),...(refreshAsset?[refreshMedia()]:[])]);if(nextId){const next=await choosePage(nextId,nextId===page?.id);if(!next)throw Error('The server accepted the operation, but read-back failed. Reload before retrying.');}setNotice(message);}
  catch(e){setError(errorOf(e));if(e instanceof CmsRequestError){if(e.code==='MUTATIONS_DISABLED')setWriteStatus('disabled');else if(e.status===401)setWriteStatus('unauthenticated');else if(e.status===403)setWriteStatus('forbidden');else if(e.status>=500)setWriteStatus('unavailable');}}finally{mutationBusy.current=false;setBusy(false);}
 };
 function saveAllDraftChanges(){
  if(!page||!unsaved)return;
  const steps:CmsDraftStep[]=[];
  if(title!==page.title||seoTitle!==page.seoTitle||seoDescription!==page.seoDescription)steps.push({kind:'pageUpdate',params:{payload:{title,seoTitle,seoDescription}}});
  const sectionChanged=selected?section.kind!==selected.kind||section.heading!==selected.heading||section.body!==selected.body||section.visible!==selected.visible:Boolean(section.heading||section.body);
  const sectionId=selected?.id??crypto.randomUUID();
  if(sectionChanged)steps.push({kind:'section',params:{sectionId,payload:{...section,order:selected?.order??(page.sections.length?Math.max(...page.sections.map(value=>value.order))+1:0)}}});
  const itemChanged=selected&&(content?item.title!==content.title||item.description!==content.description||item.url!==(content.url??'')||item.visible!==content.visible:Boolean(item.title||item.description||item.url));
  if(itemChanged)steps.push({kind:'item',params:{sectionId:selected!.id,itemId:content?.id??crypto.randomUUID(),payload:{...item,url:item.url.trim()||null,order:content?.order??(selected!.items.length?Math.max(...selected!.items.map(value=>value.order))+1:0)}}});
  if(typedDirty&&typedPreview)steps.push({kind:'fields',params:{sectionId:typedPreview.sectionId,payload:{sectionKey:typedPreview.key,content:typedPreview.value,itemId:typedPreview.itemId||null}}});
  if(!steps.length){setError('Complete the active fields before saving a draft.');return;}
  void run(async()=>{await saveCmsDraft(page.id,page.draftRevision,steps);if(sectionChanged)setSelectedSection(sectionId);},page.id,false,'Draft changes saved and confirmed. Publish separately when you are ready.');
 }
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
 const updateSettings=(e:FormEvent)=>{e.preventDefault();if(!global)return;void run(async()=>{await cmsFetch('settingsUpdate',{payload:{expectedRevision:global.revision,settings}});await refreshSettings();},null);};
 const publishSettings=()=>{if(!global||global.revision===global.publishedRevision||JSON.stringify(settings)!==JSON.stringify(global.settings)||!window.confirm('Publish global website settings?'))return;void run(async()=>{await cmsFetch('settingsPublish',{payload:{expectedRevision:global.revision}});await refreshSettings();},null,false,'Global website settings published and read back from Supabase.');};

 async function selectContext(node:CmsNode){
  const next=page?.id===node.pageId?page:await choosePage(node.pageId);if(!next)return;
  setContextFocus(node);setTypedDirty(false);setTypedPreview(null);setSelectedSection(node.sectionId??'');setSelectedItem(node.itemId??'');
  const source=next.sections.find(s=>s.id===node.sectionId),card=source?.items.find(i=>i.id===node.itemId);
  if(source&&node.schemaKey&&!source.sectionKey)setTypedPreview({sectionId:source.id,itemId:node.itemId??'',key:node.schemaKey,value:source.content??(node.schemaKey==='HOME_HERO'?{headline:source.heading,description:source.body}:{})});
  setSection(source?{kind:source.kind,heading:source.heading,body:source.body,visible:source.visible}:emptySection);setItem(card?{title:card.title,description:card.description,url:card.url??'',visible:card.visible}:emptyItem);
 }
 async function addSection(kind:CmsKind,heading:string,key?:string){if(!page)return;const id=crypto.randomUUID();void run(async()=>{await cmsFetch('section',{pageId:page.id,sectionId:id,payload:{expectedRevision:page.draftRevision,kind,heading,body:'',visible:true,order:page.sections.length?Math.max(...page.sections.map(s=>s.order))+1:0}});if(key){const next=validateCmsPage(await cmsFetch('page',{pageId:page.id})) as Page;await cmsFetch('fields',{pageId:page.id,sectionId:id,payload:{sectionKey:key,content:{},itemId:null,expectedRevision:next.draftRevision}});}},page.id,false,'Section added to the private draft.');}
 async function duplicate(source:Section,card?:Item){if(!page||!window.confirm('Duplicate this '+(card?'card':'section')+' into the private draft?'))return;void run(async()=>{let revision=page.draftRevision;const sid=card?source.id:crypto.randomUUID();const readRevision=async()=>{const next=validateCmsPage(await cmsFetch('page',{pageId:page.id})) as Page;revision=next.draftRevision;};if(!card){await cmsFetch('section',{pageId:page.id,sectionId:sid,payload:{expectedRevision:revision,kind:source.kind,heading:source.heading+' (copy)',body:source.body,visible:false,order:Math.max(...page.sections.map(s=>s.order))+1}});await readRevision();if(source.sectionKey){await cmsFetch('fields',{pageId:page.id,sectionId:sid,payload:{expectedRevision:revision,sectionKey:source.sectionKey,content:source.content??{},itemId:null}});await readRevision();}}for(const value of card?[card]:source.items){const id=crypto.randomUUID();await cmsFetch('item',{pageId:page.id,sectionId:sid,itemId:id,payload:{expectedRevision:revision,title:value.title+(card?' (copy)':''),description:value.description,url:value.url,visible:card?false:value.visible,order:card?Math.max(-1,...source.items.map(i=>i.order))+1:value.order}});await readRevision();if(source.sectionKey&&value.metadata){await cmsFetch('fields',{pageId:page.id,sectionId:sid,payload:{expectedRevision:revision,sectionKey:source.sectionKey,content:value.metadata,itemId:id}});await readRevision();}if(value.mediaId){await cmsFetch('attach',{pageId:page.id,itemId:id,mediaId:value.mediaId,payload:{expectedRevision:revision,mediaId:value.mediaId}});await readRevision();}}},page.id,false,'Copy saved privately. Review before publishing.');}
 function hide(source:Section,card?:Item){if(!page||!window.confirm((card?.visible??source.visible)?'Disable this content in the draft? It remains stored and can be enabled again.':'Enable this content in the draft?'))return;void run(()=>card?cmsFetch('item',{pageId:page.id,sectionId:source.id,itemId:card.id,payload:{expectedRevision:page.draftRevision,title:card.title,description:card.description,url:card.url,visible:!card.visible,order:card.order}}):cmsFetch('section',{pageId:page.id,sectionId:source.id,payload:{expectedRevision:page.draftRevision,kind:source.kind,heading:source.heading,body:source.body,visible:!source.visible,order:source.order}}),page.id);}
 async function saveHomeLayout(order:string[],hidden:string[]){if(!page||page.slug!=='home'||unsaved)return;void run(async()=>{const layout=page.sections.find(s=>s.sectionKey==='HOME_LAYOUT');let revision=page.draftRevision;const id=layout?.id??crypto.randomUUID();if(!layout){await cmsFetch('section',{pageId:page.id,sectionId:id,payload:{expectedRevision:revision,kind:'footer',heading:'Homepage arrangement',body:'',visible:true,order:Math.max(-1,...page.sections.map(s=>s.order))+1}});const next=validateCmsPage(await cmsFetch('page',{pageId:page.id})) as Page;revision=next.draftRevision;}await cmsFetch('fields',{pageId:page.id,sectionId:id,payload:{expectedRevision:revision,sectionKey:'HOME_LAYOUT',content:{sectionOrder:order,hiddenSections:hidden},itemId:null}});},page.id,false,'Home arrangement saved privately. Review the preview and publish Home when ready.');}
 return <CmsContextWorkspace tool={tab} writeRuntime={writeRuntime} pages={pages} page={page} preview={previewPage} media={media} settings={settings} global={global} busy={busy} loading={loading} unsaved={unsaved} error={error} notice={notice} writable={writeStatus==='enabled'} canPublish={canPublish} focus={contextFocus}
 select={selectContext} save={()=>{if(settingsDirty&&global){void run(async()=>{await cmsFetch('settingsUpdate',{payload:{expectedRevision:global.revision,settings}});await refreshSettings();},null);}else saveAllDraftChanges();}} publish={publish} reset={()=>{if(global)setSettings({...global.settings});if(page){const focus=contextFocus;void choosePage(page.id).then(async next=>{if(next&&focus){setContextFocus(focus);const s=next.sections.find(s=>s.id===focus.sectionId),i=s?.items.find(i=>i.id===focus.itemId);setSelectedSection(s?.id??'');setSelectedItem(i?.id??'');setSection(s?{kind:s.kind,heading:s.heading,body:s.body,visible:s.visible}:emptySection);setItem(i?{title:i.title,description:i.description,url:i.url??'',visible:i.visible}:emptyItem);}});}}}
 changeSection={value=>setSection(previous=>({...previous,kind:value.kind??previous.kind,heading:value.heading??previous.heading,body:value.body??previous.body,visible:value.visible??previous.visible}))} changeItem={value=>setItem(previous=>({...previous,title:value.title??previous.title,description:value.description??previous.description,url:value.url??previous.url,visible:value.visible??previous.visible}))}
 changeFields={(key,value)=>{if(!selected)return;setTypedDirty(true);setTypedPreview({sectionId:selected.id,itemId:selectedItem,key,value});}} changePage={value=>{if(value.title!==undefined)setTitle(value.title);if(value.seoTitle!==undefined)setSeoTitle(value.seoTitle);if(value.seoDescription!==undefined)setSeoDescription(value.seoDescription);}}
 createPage={(slug,title)=>{const id=crypto.randomUUID();void run(()=>cmsFetch('pageCreate',{payload:{id,slug,title,seoTitle:title,seoDescription:''}}),id);}} createSection={(kind,heading,key)=>void addSection(kind,heading,key)} createItem={()=>{if(!page||!selected)return;const id=crypto.randomUUID();void run(()=>cmsFetch('item',{pageId:page.id,sectionId:selected.id,itemId:id,payload:{expectedRevision:page.draftRevision,order:Math.max(-1,...selected.items.map(i=>i.order))+1,title:'New card',description:'',url:null,visible:false}}),page.id);}} reorder={moveContent} saveHomeLayout={(order,hidden)=>void saveHomeLayout(order,hidden)} duplicate={(section,item)=>void duplicate(section,item)} hide={hide}
 upload={async(file,alt)=>{if(!file.size||file.size>5242880||!['image/png','image/jpeg','image/webp','image/avif'].includes(file.type)||alt.trim().length<2)throw Error('Choose an image up to 5 MiB and descriptive alternative text.');await run(async()=>{const response=await fetch('/api/v1/teacher/website/media/upload',{method:'POST',headers:{'Content-Type':file.type,'x-musa-ui':'1','Idempotency-Key':crypto.randomUUID(),'x-media-id':crypto.randomUUID(),'x-media-alt':alt.trim()},body:file});if(!response.ok)throw cmsResponseError(response.status,await response.json());},page?.id??null,true,'Image uploaded privately. Choose an image field to attach it.');}}
 attach={(itemId,mediaId)=>{if(!page||!selected)return;void run(()=>mediaId?cmsFetch('attach',{pageId:page.id,itemId,mediaId,payload:{mediaId,expectedRevision:page.draftRevision}}):cmsFetch('organize',{pageId:page.id,payload:{action:'media.detach',sectionId:null,itemId,orderIds:null,expectedRevision:page.draftRevision}}),page.id);}} changeSettings={setSettings} saveSettings={updateSettings} publishSettings={publishSettings} archive={archive} retry={()=>void checkWriteStatus()}/>;
}
