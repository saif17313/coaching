'use client';
import {useEffect,useState} from 'react';
import {loadCmsPreviewSources} from '@/client/cms-preview-sources';
import {homeSectionMap,type HomeSectionMapping} from '@/client/website-composition.mjs';
import type {SitePage} from '@/server/website/public-site';
export function HomepageSectionMap({onChoose,draft}:{onChoose:(mapping:HomeSectionMapping)=>void;draft?:SitePage|null}){
 const [sources,setSources]=useState<Record<string,SitePage|null>|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;void loadCmsPreviewSources().then(value=>{if(active)setSources(value.related);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 const related=sources?{...sources,...(draft?{[draft.slug]:draft}:{})}:null;
 return <details className="studio-expansion" open><summary>Homepage sections and their editing locations</summary><p className="studio-hint">Locations correspond to the public homepage. The currently edited page uses its unsaved draft section map; other sources show their published versions. Publish each source page separately to change public cards.</p>{error&&<p role="alert">{error}</p>}{related?<div className="studio-form">{homeSectionMap(related.home,related).map(row=><div className="studio-actions" key={row.key}><button className="portal-secondary" onClick={()=>onChoose(row)}>{row.label}</button><small>{row.available?`/${row.sourceSlug} · ${row.mode}${draft?.slug===row.sourceSlug?" · editing draft":" · published source"}`:'Not configured · create on Home'}{row.catalogSlug?` · card details: /${row.catalogSlug}`:''}</small>{row.catalogSection&&row.selectionSection&&<button className="portal-text-button" onClick={()=>onChoose({...row,section:row.catalogSection,sourceSlug:row.catalogSlug!,key:row.catalog!,editorKey:row.catalog!,mode:'catalog'})}>Edit card details</button>}</div>)}</div>:!error&&<p>Loading published section relationships…</p>}</details>;
}
