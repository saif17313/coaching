import 'server-only';
const TABLES=new Set(['batch_contents','announcements','notifications','audit_logs','fee_plans','monthly_dues','payments','payment_adjustments']);
const QUERY=new Set(['select','id','batch_id','student_id','due_id','recipient_id','role','status','bill_period','actor_id','order','limit','offset']);
/** Read-only repository: same verified Supabase bearer used for Auth and RLS. */
export async function officeReadRows(table:string,accessToken:string,query:Readonly<Record<string,string>>):Promise<unknown[]> {
 if(!TABLES.has(table)||!accessToken||/[\r\n]/.test(accessToken))throw new Error('OFFICE_READ_INVALID');
 const raw=process.env.SUPABASE_URL,key=process.env.SUPABASE_ANON_KEY;
 if(!raw||!key||/[\r\n]/.test(key)||key.length>4096)throw new Error('OFFICE_READ_CONFIG');
 const origin=new URL(raw);
 const hosted=origin.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(origin.hostname)&&!origin.port;
 const local=process.env.NODE_ENV==='development'&&process.env.COACHING_LOCAL_SUPABASE_TESTING==='allow-loopback-54321'&&origin.protocol==='http:'&&origin.hostname==='127.0.0.1'&&origin.port==='54321';
 if(!(hosted||local)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('OFFICE_READ_CONFIG');
 const url=new URL(`/rest/v1/${table}`,origin);
 for(const [k,v] of Object.entries(query)){
  if(!QUERY.has(k)||typeof v!=='string'||v.length>4500||/[\r\n]/.test(v))throw new Error('OFFICE_QUERY_INVALID');
  url.searchParams.set(k,v);
 }
 const r=await fetch(url,{method:'GET',headers:{apikey:key,Authorization:`Bearer ${accessToken}`,Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new Error('OFFICE_READ_UNAVAILABLE');
 const data:unknown=await r.json();if(!Array.isArray(data))throw new Error('OFFICE_READ_SHAPE');return data;
}
