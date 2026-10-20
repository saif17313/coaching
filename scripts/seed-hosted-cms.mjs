/** Hosted DEV CMS seed — authenticated teacher RPCs only; dry-run by default. */
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const demo=JSON.parse(readFileSync(resolve(ROOT,'data/cms-demo.json'),'utf8'));
export const TARGET='rkpwqgwceekuvlizfpeb';
export const EMAIL='effytechbd@gmail.com';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS=new Set(['hero','rich-text','cards','gallery','results','courses','contact','cta','faq','news','reviews','academic-calendar','routine','materials','footer']);
export function checkDemo(x){
 if(!x||x.projectRef!==TARGET||x.teacherEmail!==EMAIL||!Array.isArray(x.pages)||x.pages.length!==12)throw Error('Invalid demo target/content');
 const seen=new Set();let sections=0,items=0;
 if(!x.settings||Object.keys(x.settings).sort().join()!==['siteTitle','tagline','contactEmail','contactPhone','footerText','logoMediaId'].sort().join())throw Error('Settings contract drift');
 if(x.settings.logoMediaId!==null||x.settings.contactPhone!==null||!/DEMO/.test(x.settings.tagline))throw Error('Demo disclaimer missing');
 for(const p of x.pages){
  if(typeof p.slug!=='string'||!/^[a-z][a-z0-9-]{1,62}$/.test(p.slug)||seen.has(p.slug)||typeof p.title!=='string'||p.title.length<2||p.title.length>160||p.seoTitle.length>160||p.seoDescription.length>300)throw Error('Invalid page/duplicate slug');
  seen.add(p.slug);
  if(!Array.isArray(p.sections)||p.sections.length===0)throw Error('Empty page');
  for(const s of p.sections){if(!KINDS.has(s.kind)||s.heading.length>160||s.body.length>6000||!Array.isArray(s.items))throw Error('Invalid section');sections++;
   for(const i of s.items){if(i.title.length>160||i.description.length>2000||i.url!==null)throw Error('Invalid item');items++;}
  }
 }
 return {pages:x.pages.length,sections,items};
}
export function parseEnv(text){
 const values={};
 for(const line of text.split(/\r?\n/)){
  const m=line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);if(!m)continue;
  let v=m[2].trim();if((v[0]==='"'&&v.at(-1)==='"')||(v[0]==="'"&&v.at(-1)==="'"))v=v.slice(1,-1);else v=v.replace(/\s+#.*$/,'');
  values[m[1]]=v;
 }
 return values;
}
export function safeConfig(config){
 const url=config.SUPABASE_URL, key=config.SUPABASE_ANON_KEY;
 if(url!==`https://${TARGET}.supabase.co`&&url!==`https://${TARGET}.supabase.co/`)throw Error('STOP: .env.local Supabase project mismatch');
 if(!key||key.length>4096||/[\x00-\x20\x7f]/.test(key))throw Error('STOP: invalid/missing publishable/anon key');
 return {base:`https://${TARGET}.supabase.co`,key};
}
async function remote(base,key,path,body,token=key){
 const headers={apikey:key,'Content-Type':'application/json'};
 if(token!==key||/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key))headers.Authorization=`Bearer ${token}`;
 const res=await fetch(`${base}${path}`,{method:'POST',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000),headers,body:JSON.stringify(body)});
 let x;try{x=await res.json();}catch{x=null;}
 if(!res.ok){const errcode=typeof x?.code==='string'?x.code:'HTTP '+res.status;const short=typeof x?.message==='string'?x.message.slice(0,140):'';throw Error(`Hosted RPC ${path.split('/').at(-1)} rejected: ${res.status} ${errcode} ${short}`);}
 return x;
}
export function plan(data=demo){const m=checkDemo(data);return {target:TARGET,email:EMAIL,...m,slugs:data.pages.map(x=>x.slug)};}
async function seed(password){
 if(typeof password!=='string'||password.length<12||password.length>4096)throw Error('Missing teacher password from secure stdin');
 const {base,key}=safeConfig(parseEnv(readFileSync(resolve(ROOT,'.env.local'),'utf8')));
 const auth=await remote(base,key,'/auth/v1/token?grant_type=password',{email:EMAIL,password});
 const token=auth?.access_token; if(!token||typeof token!=='string')throw Error('Hosted Teacher authentication returned no access token');
 const meResponse=await fetch(`${base}/auth/v1/user`,{headers:{apikey:key,Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(15000)});
 const me=await meResponse.json();if(!meResponse.ok||me.email?.toLowerCase()!==EMAIL||!UUID.test(me.id))throw Error('Authenticated identity mismatch; stopping before writes');
 const rpc=(name,args)=>remote(base,key,`/rest/v1/rpc/${name}`,args,token);
 const existing=await rpc('coaching_cms_list_pages',{});
 if(!Array.isArray(existing?.items)||existing.items.length!==0)throw Error(`STOP: CMS already contains ${existing?.items?.length??'unknown'} page(s). Zero-overwrite seed requires empty CMS. Do not rerun blindly.`);
 const settings=await rpc('coaching_cms_get_settings_draft',{});
 if(!settings||settings.revision!==0||settings.publishedRevision!==null)throw Error('STOP: CMS settings already configured; refusing overwrite');
 process.stdout.write(`Verified active Teacher CMS access; project ${TARGET}; CMS empty.\n`);
 let applied=0, published=0;
 const settingsWrite=(action,expectedRevision,value)=>rpc('coaching_cms_settings_write',{p_action:action,p_expected_revision:expectedRevision,p_settings:value,p_operation_id:randomUUID()});
 try{
  const draft=await settingsWrite('draft.update',0,demo.settings);applied++;
  await settingsWrite('publish',draft.revision,null);applied++;console.log('[PASS] Demo-labeled global settings published');
  for(const p of demo.pages){
   const pageId=randomUUID();let revision=1;
   const create=await rpc('coaching_cms_write',{p_action:'page.create',p_target:pageId,p_parent:null,p_expected_revision:null,p_data:{slug:p.slug,title:p.title,seoTitle:p.seoTitle,seoDescription:p.seoDescription},p_operation_id:randomUUID()});
   if(create?.id!==pageId||create?.revision!==1)throw Error('Unexpected create response');applied++;
   for(let idx=0;idx<p.sections.length;idx++){
    const s=p.sections[idx],sectionId=randomUUID();
    const sr=await rpc('coaching_cms_write',{p_action:'section.upsert',p_target:sectionId,p_parent:pageId,p_expected_revision:revision,p_data:{kind:s.kind,order:idx,heading:s.heading,body:s.body,visible:true},p_operation_id:randomUUID()});
    revision=sr.revision;applied++;
    for(let j=0;j<s.items.length;j++){
     const i=s.items[j];const ir=await rpc('coaching_cms_write',{p_action:'item.upsert',p_target:randomUUID(),p_parent:pageId,p_expected_revision:revision,p_data:{sectionId,order:j,title:i.title,description:i.description,url:i.url,visible:true},p_operation_id:randomUUID()});
     revision=ir.revision;applied++;
    }
   }
   const result=await rpc('coaching_cms_write',{p_action:'page.publish',p_target:pageId,p_parent:null,p_expected_revision:revision,p_data:{},p_operation_id:randomUUID()});applied++;
   if(result?.status!=='published')throw Error('Publish result invalid');
   const publicPage=await remote(base,key,'/rest/v1/rpc/coaching_cms_get_published_page',{p_slug:p.slug});
   if(!publicPage||publicPage.slug!==p.slug||publicPage.sections?.length!==p.sections.length)throw Error('Published public snapshot verification failed');
   published++;console.log(`[PASS] ${published}/${demo.pages.length} ${p.slug} published and independently read back`);
  }
  const nav=await remote(base,key,'/rest/v1/rpc/coaching_cms_public_navigation',{});
  if(!Array.isArray(nav?.items)||nav.items.length!==demo.pages.length)throw Error('Published navigation mismatch');
  const settingsPublic=await remote(base,key,'/rest/v1/rpc/coaching_cms_get_published_settings',{});
  if(settingsPublic?.settings?.siteTitle!==demo.settings.siteTitle)throw Error('Public settings verification failed');
  console.log(`[SUCCESS] ${published} pages + settings published via signed Teacher RPCs. Total audited mutations: ${applied}.`);
 }catch(e){console.error(`[STOP] ${applied} operations may have committed; ${published} fully published. Do NOT rerun automatically. Inspect CMS drafts and cloud logs. ${e.message}`);process.exitCode=2;}
}
async function main(){const args=process.argv.slice(2);const report=plan();
 if(args.length!==1||!['--plan','--apply'].includes(args[0]))throw Error('Usage: node scripts/seed-hosted-cms.mjs --plan | --apply');
 console.log(`MUSA CMS DEMO — ${report.pages} pages / ${report.sections} sections / ${report.items} items`);
 console.log(`Target: ${TARGET}, teacher: ${EMAIL}, no real results/reviews/photos; demo labels everywhere.`);
 console.log(`Slugs: ${report.slugs.join(', ')}`);
 if(args[0]==='--plan'){console.log('[DRY RUN ONLY] No network requests or writes.');return;}
 if(!existsSync(resolve(ROOT,'.env.local')))throw Error('Local .env.local missing; do not create or share it');
 if(process.stdin.isTTY)throw Error('Use guarded PowerShell launcher to supply password on stdin (not in command arguments)');
 const bufs=[];for await (const b of process.stdin){bufs.push(Buffer.from(b));if(bufs.reduce((a,x)=>a+x.length,0)>8192)throw Error('Input too large');}
 const password=Buffer.concat(bufs).toString('utf8').replace(/\r?\n$/,'');
 await seed(password);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('[STOP] '+e.message);process.exitCode=1;});
