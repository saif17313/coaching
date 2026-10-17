import 'server-only';

/** Fixed, user-JWT-scoped, exact PostgREST HEAD counts for Teacher Overview. */
type Table='profiles'|'batches'|'enrollments';
type Filter='students-total'|'students-active'|'students-pending'|'batches-open'|'enrollments-pending'|'enrollments-active';
const FILTERS:Readonly<Record<Filter,{table:Table;field:string;value:string}>>={
  'students-total':{table:'profiles',field:'role',value:'eq.student'},
  'students-active':{table:'profiles',field:'role',value:'eq.student'},
  'students-pending':{table:'profiles',field:'role',value:'eq.student'},
  'batches-open':{table:'batches',field:'is_archived',value:'eq.false'},
  'enrollments-pending':{table:'enrollments',field:'status',value:'eq.pending'},
  'enrollments-active':{table:'enrollments',field:'status',value:'eq.active'},
};
function config(){
  const raw=process.env.SUPABASE_URL,key=process.env.SUPABASE_ANON_KEY;
  if(!raw||!key||/[\r\n]/.test(key)||key.length>4096)throw Error('DB_NOT_CONFIGURED');
  let root:URL;
  try{root=new URL(raw);}catch{throw Error('DB_NOT_CONFIGURED');}
  const hosted=root.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(root.hostname)&&!root.port;
  const local=process.env.NODE_ENV==='development'&&process.env.COACHING_LOCAL_SUPABASE_TESTING==='allow-loopback-54321'&&root.protocol==='http:'&&root.hostname==='127.0.0.1'&&root.port==='54321';
  if(!(hosted||local)||root.username||root.password||root.pathname!=='/'||root.search||root.hash)throw Error('INVALID_DB_ORIGIN');
  return {root,key};
}
export async function countOverviewRows(table:Table,token:string,filter:Filter):Promise<number>{
  const cfg=FILTERS[filter];
  if(!cfg||cfg.table!==table||typeof token!=='string'||token.length>8192||!(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/).test(token))throw Error('INVALID_DB_COUNT');
  const {root,key}=config();
  const url=new URL(`/rest/v1/${table}`,root);
  url.searchParams.set('select','id');
  url.searchParams.set(cfg.field,cfg.value);
  if(filter==='students-active')url.searchParams.set('account_status','eq.active');
  if(filter==='students-pending')url.searchParams.set('account_status','eq.pending');
  let result:Response;
  try{
    result=await fetch(url,{method:'HEAD',headers:{apikey:key,Authorization:`Bearer ${token}`,Prefer:'count=exact',Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
  }catch{throw Error('DB_COUNT_UNAVAILABLE');}
  if(!result.ok)throw Error('DB_COUNT_REJECTED');
  const header=result.headers.get('content-range');
  const match=header&&/^(?:\*|[0-9]+-[0-9]+)\/(0|[1-9][0-9]*)$/.exec(header);
  if(!match)throw Error('DB_COUNT_BAD_HEADER');
  const count=Number(match[1]);
  if(!Number.isSafeInteger(count))throw Error('DB_COUNT_BAD_COUNT');
  return count;
}
