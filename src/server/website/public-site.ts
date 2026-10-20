import 'server-only';
import {validateCmsFields} from '@/client/cms-fields.mjs';
export type SiteItem={id:string;order:number;title:string;description:string;mediaId:string|null;url:string|null;metadata?:Record<string,unknown>};
export type SiteSection={id:string;kind:string;order:number;heading:string;body:string;items:SiteItem[];sectionKey?:string;content?:Record<string,unknown>};
export type SitePage={schemaVersion:1;slug:string;revision:number;title:string;seoTitle:string;seoDescription:string;sections:SiteSection[]};
export type SiteSettings={revision:number;settings:{siteTitle:string;tagline:string;footerText:string;contactEmail:string;contactPhone:string|null;logoMediaId:string|null}};
export type NavItem={slug:string;title:string};
function config(){const raw=process.env.SUPABASE_URL,key=process.env.SUPABASE_ANON_KEY;
 if(!raw||!key||key.length>4096||/[\x00-\x20\x7f]/.test(key))return null;
 let root:URL;try{root=new URL(raw);}catch{return null;}
 const hosted=root.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(root.hostname)&&!root.port;
 const local=process.env.NODE_ENV==='development'&&process.env.COACHING_LOCAL_SUPABASE_TESTING==='allow-loopback-54321'&&root.protocol==='http:'&&root.hostname==='127.0.0.1'&&root.port==='54321';
 if(!(hosted||local)||root.username||root.password||root.pathname!=='/'||root.search||root.hash)return null;return {root,key};}
async function rpc(name:string,args:Record<string,unknown>):Promise<unknown>{
 if(!['coaching_cms_public_fingerprint','coaching_cms_get_published_page','coaching_cms_get_published_settings','coaching_cms_public_navigation'].includes(name))return null;
 const c=config();if(!c)return null;
 try{const res=await fetch(new URL(`/rest/v1/rpc/${name}`,c.root),{method:'POST',headers:{apikey:c.key,Authorization:`Bearer ${c.key}`,'Content-Type':'application/json'},body:JSON.stringify(args),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(7000)});if(!res.ok)return null;return await res.json();}catch{return null;}
}
export async function publicRevisionFingerprint():Promise<string|null>{
 const value=await rpc('coaching_cms_public_fingerprint',{});
 if(!value||typeof value!=='object')return null;
 const token=Reflect.get(value,'fingerprint');return typeof token==='string'&&/^[0-9a-f]{32}$/.test(token)?token:null;
}
export async function publicPage(slug:string):Promise<SitePage|null>{
 if(!/^[a-z][a-z0-9-]{1,62}$/.test(slug)||slug.includes('--')||slug.endsWith('-'))return null;
 const d=await rpc('coaching_cms_get_published_page',{p_slug:slug});
 if(!d||typeof d!=='object'||Array.isArray(d))return null;
 const p=d as Partial<SitePage>;
 if(p.schemaVersion!==1||p.slug!==slug||!Number.isSafeInteger(p.revision)||typeof p.title!=='string'||typeof p.seoTitle!=='string'||!Array.isArray(p.sections)||p.sections.length>60)return null;
 for(const s of p.sections){if(!s||typeof s!=='object'||typeof s.kind!=='string'||typeof s.heading!=='string'||typeof s.body!=='string'||!Array.isArray(s.items)||s.items.length>100||s.sectionKey&&!validateCmsFields(s.sectionKey,s.content))return null;
  if(s.items.some(i=>i.metadata&&(!s.sectionKey||!validateCmsFields(s.sectionKey,i.metadata,true))))return null;
 }
 return p as SitePage;
}
export async function publicSettings():Promise<SiteSettings|null>{const d=await rpc('coaching_cms_get_published_settings',{});
 if(!d||typeof d!=='object'||Array.isArray(d))return null;const s=d as Partial<SiteSettings>;
 if(!s.settings||typeof s.settings.siteTitle!=='string'||typeof s.settings.footerText!=='string')return null;return s as SiteSettings;
}
export async function publicNavigation():Promise<NavItem[]>{const d=await rpc('coaching_cms_public_navigation',{});
 if(!d||typeof d!=='object'||!Array.isArray((d as {items?:unknown}).items))return [];
 const v=(d as {items:unknown[]}).items;
 if(v.length>50)return [];
 const seen=new Set<string>();const items:NavItem[]=[];
 for(const item of v){if(!item||typeof item!=='object'||Array.isArray(item))return [];const x=item as Partial<NavItem>;
  if(typeof x.slug!=='string'||!/^[a-z][a-z0-9-]{1,62}$/.test(x.slug)||x.slug.endsWith('-')||x.slug.includes('--')||seen.has(x.slug)||typeof x.title!=='string'||x.title.length>160)return [];
  seen.add(x.slug);items.push({slug:x.slug,title:x.title});}
 return items;
}
