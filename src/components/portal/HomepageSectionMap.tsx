'use client';
import {useEffect,useState} from 'react';
import {loadCmsPreviewSources} from '@/client/cms-preview-sources';
import {homeSectionMap,type HomeSectionMapping} from '@/client/website-composition.mjs';
import type {SitePage} from '@/server/website/public-site';
export function HomepageSectionMap({onChoose}:{onChoose:(mapping:HomeSectionMapping)=>void}){
 const [sources,setSources]=useState<Record<string,SitePage|null>|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;void loadCmsPreviewSources().then(value=>{if(active)setSources(value.related);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 return <details className="studio-expansion" open><summary>Homepage sections and their editing locations</summary><p className="studio-hint">These locations follow the actual public homepage. A shared source also updates its own public page after publication. Homepage selections choose which published cards appear here.</p>{error&&<p role="alert">{error}</p>}{sources?<div className="studio-form">{homeSectionMap(sources.home,sources).map(row=><div className="studio-actions" key={row.key}><button className="portal-secondary" onClick={()=>onChoose(row)}>{row.label}</button><small>{row.available?`/${row.sourceSlug} · ${row.mode}`:'Not configured · create on Home'}{row.catalogSlug?` · card details: /${row.catalogSlug}`:''}</small>{row.catalogSection&&row.selectionSection&&<button className="portal-text-button" onClick={()=>onChoose({...row,section:row.catalogSection,sourceSlug:row.catalogSlug!,key:row.catalog!,mode:'catalog'})}>Edit card details</button>}</div>)}</div>:!error&&<p>Loading published section relationships…</p>}</details>;
}
