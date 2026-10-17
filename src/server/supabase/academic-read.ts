import 'server-only';
const TABLES=new Set(['academic_subjects','syllabus_units','routine_slots','academic_assignments','exams','exam_results']);
const QUERY=new Set(['select','id','batch_id','subject_id','exam_id','status','result_status','limit','offset','order']);
export type AcademicTable='academic_subjects'|'syllabus_units'|'routine_slots'|'academic_assignments'|'exams'|'exam_results';

/** Teacher-only repository; caller has already verified role and Auth token. */
export async function readSupabaseAcademicRows(table:AcademicTable,accessToken:string,query:Readonly<Record<string,string>>):Promise<unknown[]> {
 if(!TABLES.has(table)||!accessToken||/[\r\n]/.test(accessToken))throw new Error('ACADEMIC_READER_REJECTED');
 const urlRaw=process.env.SUPABASE_URL,key=process.env.SUPABASE_ANON_KEY;
 if(!urlRaw||!key||/[\r\n]/.test(key)||key.length>4096)throw new Error('ACADEMIC_READER_CONFIG');
 const base=new URL(urlRaw),hosted=base.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(base.hostname)&&!base.port;
 const local=process.env.NODE_ENV==='development'&&process.env.COACHING_LOCAL_SUPABASE_TESTING==='allow-loopback-54321'&&base.protocol==='http:'&&base.hostname==='127.0.0.1'&&base.port==='54321';
 if(!(hosted||local)||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw new Error('ACADEMIC_READER_CONFIG');
 const url=new URL(`/rest/v1/${table}`,base);
 for(const [name,value] of Object.entries(query)){
  if(!QUERY.has(name)||typeof value!=='string'||value.length>300||/[\r\n]/.test(value))throw new Error('ACADEMIC_QUERY_REJECTED');
  url.searchParams.set(name,value);
 }
 const response=await fetch(url,{method:'GET',headers:{apikey:key,Authorization:`Bearer ${accessToken}`,Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('ACADEMIC_READ_UNAVAILABLE');
 const rows:unknown=await response.json();if(!Array.isArray(rows))throw new Error('ACADEMIC_READ_INVALID');return rows;
}
