'use client';
import {useEffect,useState} from 'react';
import {validateCmsPage} from '@/client/cms-studio.mjs';
import {DraftMediaScope} from '../website/SiteImage';
import {SitePresentation} from '../website/SitePresentation';
import type {SitePage,SiteItem,SiteSection,SiteSettings,NavItem} from '@/server/website/public-site';
type Draft=Omit<SitePage,'revision'|'schemaVersion'|'sections'>&{draftRevision:number;sections:(Omit<SiteSection,'items'>&{visible:boolean;items:(SiteItem&{visible:boolean})[]})[]};
type Payload={page:SitePage;related:Record<string,SitePage|null>;settings:SiteSettings|null;navigation:NavItem[]};
export function CmsPreviewCanvas(){
 const [payload,setPayload]=useState<Payload|null>(null);
 useEffect(()=>{function receive(event:MessageEvent){if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='educentre-draft-preview')return;try{const raw=event.data;const draft=validateCmsPage<Draft>(raw.draft);const publicPage={schemaVersion:1,slug:draft.slug,title:draft.title,seoTitle:draft.seoTitle,seoDescription:draft.seoDescription,revision:draft.draftRevision,sections:draft.sections.filter(s=>s.visible).map(s=>({...s,items:s.items.filter(i=>i.visible)}))} as SitePage;const related={...raw.related,[draft.slug]:publicPage};const page=raw.surface==='home'&&draft.slug!=='home'?related.home:publicPage;if(page)setPayload({page,related,settings:raw.settings,navigation:raw.navigation});}catch{/* Invalid draft messages never render. */}}window.addEventListener('message',receive);window.parent.postMessage({type:'educentre-preview-ready'},location.origin);return()=>window.removeEventListener('message',receive);},[]);
 return payload?<div data-preview="draft"><DraftMediaScope><SitePresentation {...payload} preview/></DraftMediaScope></div>:<p role="status">Waiting for your draft preview…</p>;
}
