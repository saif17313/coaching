'use client';
import {useEffect,useState} from 'react';
import './structured-cms.css';
import {CMS_FORMS,validateCmsFields,validateSchema,type FieldSchema} from '@/client/cms-fields.mjs';
import {cmsFieldGroups} from '@/client/cms-field-groups.mjs';
type Choice={id:string;title:string};
type Media={id:string;alt:string;status:string};
function initial(schema:FieldSchema):unknown{if(schema.oneOf)return initial(schema.oneOf[0]);return schema.type==='object'?{}:schema.type==='array'?[]:schema.type==='boolean'?false:schema.type==='integer'?schema.minimum??0:'';}
function Fields({schema,value,onChange,path,media,choices}:{schema:FieldSchema;value:unknown;onChange:(value:unknown)=>void;path:string;media:Media[];choices:Choice[]}){
 if(schema.oneOf){const branch=schema.oneOf.find(x=>validateSchema(value,x))??schema.oneOf[0];return <Fields schema={branch} value={value} onChange={onChange} path={path} media={media} choices={choices}/>;}
 if(schema.type==='object'){
  const current=(value&&typeof value==='object'&&!Array.isArray(value)?value:{}) as Record<string,unknown>;
  return <div className="studio-form">{Object.entries(schema.properties??{}).map(([key,field])=><Fields key={key} schema={field} value={current[key]??initial(field)} path={`${path} ${field.title??key}`} media={media} choices={choices} onChange={next=>onChange({...current,[key]:next})}/>)}</div>;
 }
 if(schema.type==='array'&&schema.items){
  const rows=Array.isArray(value)?value:[],itemSchema=schema.items;
  const update=(i:number,next:unknown)=>onChange(rows.map((x,j)=>j===i?next:x));
  const move=(i:number,direction:number)=>{const next=rows.slice();[next[i],next[i+direction]]=[next[i+direction],next[i]];onChange(next);};
  return <fieldset className="studio-expansion"><legend>{schema.title}</legend>{rows.map((row,index)=><div key={index} className="studio-form-separated"><Fields schema={itemSchema} value={row} onChange={next=>update(index,next)} path={`${path} ${index+1}`} media={media} choices={choices}/><div className="studio-actions"><button type="button" className="portal-secondary" disabled={index===0} aria-label={`Move ${schema.title} ${index+1} up`} onClick={()=>move(index,-1)}>↑</button><button type="button" className="portal-secondary" disabled={index===rows.length-1} aria-label={`Move ${schema.title} ${index+1} down`} onClick={()=>move(index,1)}>↓</button><button type="button" className="portal-secondary" onClick={()=>onChange(rows.filter((_,i)=>i!==index))}>Remove {schema.title} {index+1}</button></div></div>)}<button type="button" className="portal-secondary" disabled={rows.length>=(schema.maxItems??30)} onClick={()=>onChange([...rows,initial(itemSchema)])}>Add {schema.title}</button></fieldset>;
 }
 if(schema.type==='boolean')return <label className="studio-check"><input type="checkbox" aria-label={path} checked={value===true} onChange={e=>onChange(e.target.checked)}/>{schema.title}</label>;
 if(schema.media&&schema.title!=='Featured article ID')return <label>{schema.title}<select aria-label={path} value={typeof value==='string'?value:''} onChange={e=>onChange(e.target.value)}><option value="">No image</option>{media.filter(m=>m.status==='ready').map(m=><option key={m.id} value={m.id}>{m.alt}</option>)}</select></label>;
 if(schema.title==='Published record ID'||schema.title==='Featured article ID')return <label>{schema.title}<select aria-label={path} value={String(value??'')} onChange={e=>onChange(e.target.value)}><option value="">Choose published record</option>{choices.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>;
 if(schema.enum)return <label>{schema.title}<select aria-label={path} value={String(value??'')} onChange={e=>onChange(e.target.value)}><option value="">Choose value</option>{schema.enum.map(x=><option key={x}>{x}</option>)}</select></label>;
 if((schema.maxLength??0)>500&&!schema.link)return <label>{schema.title}<textarea rows={3} aria-label={path} maxLength={schema.maxLength} value={typeof value==='string'?value:''} onChange={e=>onChange(e.target.value)}/></label>;
 return <label>{schema.title}<input aria-label={path} type={schema.type==='integer'?'number':'text'} min={schema.minimum} max={schema.maximum} maxLength={schema.maxLength} value={typeof value==='string'||typeof value==='number'?value:''} placeholder={schema.link?'/site/courses or https://…':undefined} onChange={e=>onChange(schema.type==='integer'?Number(e.target.value):e.target.value)}/></label>;
}
function DraftFields({schema,value}:{schema:FieldSchema;value:unknown}){
 if(value===undefined||value===null||value==='')return null;
 if(schema.oneOf){const branch=schema.oneOf.find(x=>validateSchema(value,x));return branch?<DraftFields schema={branch} value={value}/>:null;}
 if(schema.type==='object'&&typeof value==='object'&&!Array.isArray(value))return <div>{Object.entries(value).map(([key,next])=>schema.properties?.[key]?<DraftFields key={key} schema={schema.properties[key]} value={next}/>:null)}</div>;
 if(schema.type==='array'&&Array.isArray(value)&&schema.items){const child=schema.items;return <div><strong>{schema.title}</strong>{value.map((entry,i)=><DraftFields key={i} schema={child} value={entry}/>)}</div>;}
 if(schema.media||schema.title==='Published record ID')return <p>{schema.title}: {value?'Selected':'None'}</p>;
 return <p><strong>{schema.title}: </strong>{typeof value==='boolean'?(value?'Yes':'No'):String(value)}</p>;
}
export function StructuredCmsEditor({sectionKey,suggestedKey,kind,value,item=false,busy,media,onDirty,onSave,onPreview}:{sectionKey?:string;suggestedKey?:string|null;kind:string;value:Record<string,unknown>;item?:boolean;busy:boolean;media:Media[];onDirty:()=>void;onSave:(key:string,value:Record<string,unknown>)=>void;onPreview?:(key:string,value:Record<string,unknown>)=>void}){
 const [key,setKey]=useState(sectionKey??suggestedKey??Object.values(CMS_FORMS).find(x=>x.kind===kind)?.key??'HOME_HERO');
 const [fields,setFields]=useState(value),[choices,setChoices]=useState<Choice[]>([]);
 const [error,setError]=useState('');
 const form=CMS_FORMS[key],schema=form?.[item?'item':'section'];
 useEffect(()=>{
  const controller=new AbortController();
  const slug=key==='HOME_FEATURED_COURSES'?'courses':key==='HOME_STUDENT_SUCCESS'||key==='HOME_TOP_STUDENTS'?'results':key==='HOME_TESTIMONIALS'?'reviews':key==='HOME_GALLERY'?'gallery':key==='HOME_NEWS_EVENTS'?'news-events':null;
  if(slug)void fetch(`/api/v1/public/site-pages/${slug}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
   if(!response.ok)return;
   const json=await response.json();if(controller.signal.aborted)return;
   const sections=json?.data?.sections;
   if(Array.isArray(sections))setChoices(sections.flatMap((s:{items:Choice[]})=>s.items??[]).map((x:Choice)=>({id:x.id,title:x.title})));
  }).catch(()=>{});
  return()=>controller.abort();
 },[key]);
 return <form className="studio-form studio-form-separated" onSubmit={e=>{e.preventDefault();if(!validateCmsFields(key,fields,item)){setError('Check the highlighted field values, links and selected records.');return;}setError('');onSave(key,fields);}}><h4>{item?'Content details':form?.label??'Reference fields'}</h4><label>Content form<select value={key} disabled={Boolean(sectionKey)||busy} onChange={e=>{setKey(e.target.value);setFields({});setChoices([]);onPreview?.(e.target.value,{});onDirty();}}>{Object.values(CMS_FORMS).filter(f=>f.kind===kind).map(f=><option key={f.key} value={f.key}>{f.label}</option>)}</select></label>{error&&<p role="alert">{error}</p>}<fieldset disabled={busy}>{schema&&cmsFieldGroups(key,schema.properties,item).map(group=><fieldset className="studio-expansion" key={group.label}><legend>{group.label}</legend><Fields schema={{type:'object',properties:Object.fromEntries(group.keys.map(name=>[name,schema.properties![name]]))}} value={fields} onChange={next=>{setFields(next as Record<string,unknown>);onPreview?.(key,next as Record<string,unknown>);onDirty();}} path={form.label} media={media} choices={choices}/></fieldset>)}</fieldset><details className="studio-expansion"><summary>Preview unsaved fields</summary>{schema&&<DraftFields schema={schema} value={fields}/>}</details><p className="studio-hint">Save these fields as a draft, then publish the page. Images come from your verified media library. Featured selections use published records in the order shown.</p><button className="portal-primary" disabled={busy}>Save {item?'content details':'structured fields'}</button></form>;
}
