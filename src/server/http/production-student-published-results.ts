import 'server-only';
import {studentPublishedResultsEndpoint} from './academic-publication.mjs';
import {verifyActiveActor} from './production-read-adapter';
async function read(c:{token:string;limit:number;offset:number}):Promise<unknown>{
 const raw=process.env.SUPABASE_URL,key=process.env.SUPABASE_ANON_KEY;
 if(!raw||!key||/[^\x21-\x7e]/.test(key)||key.length>4096)throw Error('INVALID_DB_CONFIG');
 let root:URL;try{root=new URL(raw);}catch{throw Error('INVALID_DB_CONFIG');}
 const hosted=root.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(root.hostname)&&!root.port;
 const local=process.env.NODE_ENV==='development'&&process.env.COACHING_LOCAL_SUPABASE_TESTING==='allow-loopback-54321'&&root.protocol==='http:'&&root.hostname==='127.0.0.1'&&root.port==='54321';
 if(!(hosted||local)||root.username||root.password||root.pathname!=='/'||root.search||root.hash)throw Error('INVALID_DB_ORIGIN');
 const res=await fetch(new URL('/rest/v1/rpc/coaching_get_my_published_exam_results',root),{method:'POST',headers:{apikey:key,Authorization:`Bearer ${c.token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({p_limit:c.limit,p_offset:c.offset}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!res.ok)throw Error('RPC_FAILED');return res.json();
}
export const studentPublishedExamResults=studentPublishedResultsEndpoint({verify:verifyActiveActor,read});
