import 'server-only';
import {createCmsSettingsRoute,type CmsSettingsKind} from './cms-settings-navigation.mjs';
import {verifyActiveActor} from './production-read-adapter';
function origin():{root:URL,key:string}{
 const raw=process.env.SUPABASE_URL,key=process.env.SUPABASE_ANON_KEY;
 if(!raw||!key||/[^\x21-\x7e]/.test(key)||key.length>4096)throw Error('INVALID_DB_CONFIG');
 let root:URL;try{root=new URL(raw);}catch{throw Error('INVALID_DB_CONFIG');}
 const hosted=root.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(root.hostname)&&!root.port;
 const local=process.env.NODE_ENV==='development'&&process.env.COACHING_LOCAL_SUPABASE_TESTING==='allow-loopback-54321'&&root.protocol==='http:'&&root.hostname==='127.0.0.1'&&root.port==='54321';
 if(!(hosted||local)||root.username||root.password||root.pathname!=='/'||root.search||root.hash)throw Error('INVALID_DB_ORIGIN');
 return {root,key};
}
async function call(name:string,token:string|null,args:Record<string,unknown>):Promise<unknown>{
 if(['coaching_cms_settings_write','coaching_cms_archive_page'].includes(name)&&process.env.COACHING_ENABLE_MUTATION_APIS!=='enabled-after-db-verification')throw Error('MUTATIONS_DISABLED');
 const allow=['coaching_cms_settings_write','coaching_cms_archive_page','coaching_cms_get_settings_draft','coaching_cms_public_navigation'];
 if(!allow.includes(name))throw Error('INVALID_RPC');
 const {root,key}=origin();const res=await fetch(new URL(`/rest/v1/rpc/${name}`,root),{
  method:'POST',headers:{apikey:key,Authorization:`Bearer ${token??key}`,Accept:'application/json','Content-Type':'application/json'},
  body:JSON.stringify(args),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!res.ok)throw Error('CMS_RPC_FAILED');return res.json();
}
export const cmsSettingsRoute=(kind:CmsSettingsKind)=>createCmsSettingsRoute(kind,{verify:verifyActiveActor,call});
