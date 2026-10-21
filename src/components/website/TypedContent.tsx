import Image from './SiteImage';
import './typed-content.css';
import Link from 'next/link';
import {CMS_FORMS,safeContentUrl,validateSchema,type FieldSchema} from '@/client/cms-fields.mjs';
import type {SiteSection} from '@/server/website/public-site';
import {PublishedVideo} from './PublishedVideo';
import {youtubeVideoId} from '@/client/cms-video.mjs';
const mediaId=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function Value({value,schema,name,path=[]}:{value:unknown;schema:FieldSchema;name:string;path?:(string|number)[]}){
 if(schema.oneOf){const branch=schema.oneOf.find(x=>validateSchema(value,x));return branch?<Value value={value} schema={branch} name={name} path={path}/>:null;}
 if(['id','displayOrder','icon','iconName','colorTheme','variant'].includes(name))return null;
 if(value===null||value===undefined||value===''||typeof value==='boolean'||schema.relation||name==='featuredId')return null;
 if(schema.media)return mediaId(value)?<Image unoptimized src={`/api/v1/public/media/${value}`} alt={schema.title??''} width={640} height={480} className="tale-media-picture"/>:null;
 if(schema.type==='array'&&schema.items){const itemSchema=schema.items;return Array.isArray(value)&&value.length>0?<div className="tale-typed-list" data-cms-path={JSON.stringify(path)}>{value.map((entry,i)=><div className="tale-typed-entry" key={i} data-cms-path={JSON.stringify([...path,i])}><Value value={entry} schema={itemSchema} name={name} path={[...path,i]}/></div>)}</div>:null;}
 if(schema.type==='object'&&typeof value==='object')return <div className="tale-typed-record" data-cms-path={JSON.stringify(path)}>{Object.entries(value).map(([key,next])=>schema.properties?.[key]?<Value key={key} name={key} value={next} schema={schema.properties[key]} path={[...path,key]}/>:null)}</div>;
 if(schema.link&&typeof value==='string'&&safeContentUrl(value)){
  if(name==='mapEmbedUrl'){
   let allowed=false;
   try{const u=new URL(value);allowed=['maps.google.com','www.google.com'].includes(u.hostname)&&u.pathname.startsWith('/maps');}catch{/* Invalid embeds are not rendered. */}
   return allowed?<iframe title="Coaching centre location" loading="lazy" referrerPolicy="no-referrer" src={value} className="tale-contact-map"/>:null;
  }
  const video=youtubeVideoId(value);
  if(video)return <div data-cms-path={JSON.stringify(path)}><PublishedVideo videoId={video} title="Published video class"/></div>;
  return value.startsWith('/')?<Link href={value}>{schema.title??'View more'} →</Link>:<a href={value} rel="noopener noreferrer" target="_blank">{schema.title??'View more'} ↗</a>;
 }
 if(typeof value!=='string'&&typeof value!=='number')return null;
 if(['title','title1','title2','heading','headline','teacherName','question','value'].includes(name))return <h3 data-cms-path={JSON.stringify(path)}>{String(value)}</h3>;
 return <p className="tale-typed-value" data-cms-path={JSON.stringify(path)}>{['year','date','category','duration','schedule','examType','institution','rating'].includes(name)&&<strong>{schema.title}: </strong>}{String(value)}</p>;
}
export function TypedContent({section,omit=[]}:{section:SiteSection;omit?:string[]}){
 const schema=section.sectionKey?CMS_FORMS[section.sectionKey]?.section:null;
 return schema&&section.content?<div className="tale-typed-content"><Value value={Object.fromEntries(Object.entries(section.content).filter(([key])=>!omit.includes(key)))} schema={schema} name="content"/></div>:null;
}
export function ItemDetails({section,value}:{section:SiteSection;value:Record<string,unknown>}){
 const schema=section.sectionKey?CMS_FORMS[section.sectionKey]?.item:null;
 return schema?<div className="tale-typed-content">{value.demo===true&&<strong className="tale-pill">DEMO</strong>}<Value value={value} schema={schema} name="metadata"/></div>:null;
}
