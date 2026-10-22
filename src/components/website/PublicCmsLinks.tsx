'use client';
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import Link from '@/components/common/ProgressLink';
type Entry={label:string;sourceSlug:string;sectionId?:string;schemaKey?:string;selector:string;surface:'home'|'page'};
export function PublicCmsLinks({entries}:{entries:Entry[]}){
 const [teacher,setTeacher]=useState(false),[targets,setTargets]=useState<{entry:Entry;node:Element}[]>([]);
 useEffect(()=>{let active=true;void fetch('/api/portal/auth/session',{cache:'no-store'}).then(async r=>{if(r.ok){const body=await r.json();if(active)setTeacher(body.data?.role==='teacher');}}).catch(()=>{});return()=>{active=false;};},[]);
 useEffect(()=>{const next=entries.flatMap(entry=>{const node=document.querySelector(entry.selector);return node?[{entry,node}]:[];});void Promise.resolve().then(()=>setTargets(next));},[entries]);
 if(!teacher)return null;
 return <>{targets.map(({entry,node})=>{const query=new URLSearchParams({cmsPage:entry.sourceSlug,cmsSurface:entry.surface,...(entry.sectionId?{cmsSection:entry.sectionId}:{}),...(entry.schemaKey?{cmsForm:entry.schemaKey}:{})});return createPortal(<Link className="tale-cms-edit" href={'/portal?'+query.toString()}>Edit {entry.label} ↗</Link>,node,entry.selector);})}</>;
}
