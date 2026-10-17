import 'server-only';
/** User-JWT-scoped exact counts, not a capacity reservation. The mutation RPC owns locking. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
export async function countTeacherBatchEnrollments(token:string,batchId:string,status:'active'|'pending'):Promise<number>{
 if(!UUID.test(batchId)||!JWT.test(token)||token.length>8192||!['active','pending'].includes(status))throw Error('INVALID_COUNT_REQUEST');
 const raw=process.env.SUPABASE_URL,key=process.env.SUPABASE_ANON_KEY;
 if(!raw||!key||/[\r\n]/.test(key)||key.length>4096)throw Error('DB_NOT_CONFIGURED');
 let root:URL;try{root=new URL(raw);}catch{throw Error('DB_NOT_CONFIGURED');}
 const hosted=root.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(root.hostname)&&!root.port;
 const local=process.env.NODE_ENV==='development'&&process.env.COACHING_LOCAL_SUPABASE_TESTING==='allow-loopback-54321'&&root.protocol==='http:'&&root.hostname==='127.0.0.1'&&root.port==='54321';
 if(!(hosted||local)||root.username||root.password||root.pathname!=='/'||root.search||root.hash)throw Error('INVALID_DB_ORIGIN');
 const url=new URL('/rest/v1/enrollments',root);
 url.searchParams.set('select','id');url.searchParams.set('batch_id',`eq.${batchId}`);url.searchParams.set('status',`eq.${status}`);
 const response=await fetch(url,{method:'HEAD',headers:{apikey:key,Authorization:`Bearer ${token}`,Prefer:'count=exact',Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('COUNT_FAILED');
 const rawCount=response.headers.get('content-range');
 const match=rawCount&&/^(?:\*|[0-9]+-[0-9]+)\/(0|[1-9][0-9]*)$/.exec(rawCount);
 if(!match)throw Error('COUNT_INVALID');
 const count=Number(match[1]);if(!Number.isSafeInteger(count))throw Error('COUNT_INVALID');
 return count;
}
