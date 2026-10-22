/** Add global editing controls without changing existing editorial content. */
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {parseEnv,safeConfig} from './seed-hosted-cms.mjs';
const {base,key}=safeConfig(parseEnv(readFileSync('.env.local','utf8'))),doc=readFileSync(process.env.EDUCENTRE_TEST_CREDENTIAL_FILE,'utf8'),email=doc.match(/Teacher:\s*`([^`]+)`/)?.[1],password=doc.match(/Shared test password:\s*`([^`]+)`/)?.[1];if(!email||!password)throw Error('Authorized local Teacher credentials required');
let token=key;async function post(path,data){const r=await fetch(base+path,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(20000)});const value=await r.json();if(!r.ok)throw Error(path.split('/').at(-1)+' HTTP '+r.status+' '+(value.code??''));return value;}const rpc=(name,args={})=>post('/rest/v1/rpc/'+name,args);
token=(await post('/auth/v1/token?grant_type=password',{email,password})).access_token;
const pages=(await rpc('coaching_cms_list_pages')).items,home=pages.find(p=>p.slug==='home');if(!home)throw Error('Home page missing');const draft=await rpc('coaching_cms_get_page',{p_page_id:home.id});
if(draft.sections.some(s=>s.sectionKey==='GLOBAL_FOOTER')){console.log('Existing global footer controls preserved.');process.exit(0);}if(draft.draftRevision!==draft.publishedRevision)throw Error('Home has unpublished edits; no content changed.');
let revision=draft.draftRevision;const id=randomUUID();const write=async(action,target,data)=>{const r=await rpc('coaching_cms_write',{p_action:action,p_target:target,p_parent:action==='page.publish'?null:home.id,p_expected_revision:revision,p_data:data,p_operation_id:randomUUID()});revision=r.revision;};
await write('section.upsert',id,{kind:'footer',order:Math.max(...draft.sections.map(s=>s.order))+1,heading:'Website appearance & interface',body:'',visible:true});
const updated=await rpc('coaching_cms_fields_write',{p_page_id:home.id,p_section_id:id,p_item_id:null,p_section_key:'GLOBAL_FOOTER',p_content:{},p_expected_revision:revision,p_operation_id:randomUUID()});revision=updated.revision;
await write('page.publish',home.id,{});const published=await rpc('coaching_cms_get_published_page',{p_slug:'home'});if(published.revision!==revision||published.sections.filter(s=>s.sectionKey!=='GLOBAL_FOOTER').length!==draft.sections.length)throw Error('Read-back mismatch');console.log('Global appearance and interface editing ready; existing Home sections preserved.');
