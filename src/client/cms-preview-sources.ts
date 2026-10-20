import type {NavItem,SitePage} from '@/server/website/public-site';
type Sources={related:Record<string,SitePage|null>;navigation:NavItem[]};
// Only public snapshots are shared, and only while a request is in flight.
let pending:Promise<Sources>|null=null;
export function loadCmsPreviewSources():Promise<Sources>{
 if(pending)return pending;
 pending=Promise.all([
  Promise.all(['home','about','courses','results','reviews','news-events','gallery'].map(async slug=>{
   const response=await fetch('/api/v1/public/site-pages/'+slug,{cache:'no-store'});
   if(response.status===404)return [slug,null] as const;
   const body=await response.json();
   if(!response.ok||!body.success)throw Error('Published preview sources are unavailable.');
   return [slug,body.data as SitePage] as const;
  })),
  fetch('/api/v1/public/site-navigation',{cache:'no-store'}).then(async response=>{
   const body=await response.json();
   if(!response.ok||!body.success||!Array.isArray(body.data?.items))throw Error('Published navigation is unavailable.');
   return body.data.items as NavItem[];
  })
 ]).then(([entries,navigation])=>({related:Object.fromEntries(entries),navigation})).finally(()=>{pending=null;});
 return pending;
}
