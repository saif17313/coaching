import 'server-only';
import { readSupabaseRows } from '../supabase/rest';
import { verifySupabaseUser } from './supabase-read-auth.mjs';
import { BoundaryError, createProtectedReadEndpoint, type ProtectedScope, type VerifiedReadActor } from './protected-read.mjs';

/** Verified Auth user + DB role + RLS-scoped reads. No mutations or service-role key. */
export async function verifyActiveActor(accessToken:string):Promise<VerifiedReadActor & {accountStatus:'active'}>{
  const identity=await verifySupabaseUser(accessToken,{
    projectUrl:process.env.SUPABASE_URL,
    anonKey:process.env.SUPABASE_ANON_KEY,
  });
  if(!identity)throw new BoundaryError(401,'UNAUTHORIZED');
  const rows=await readSupabaseRows<unknown>('profiles',accessToken,{
    select:'id,role,full_name,account_status',id:`eq.${identity.id}`,limit:'1'
  });
  if(rows.length!==1)throw new BoundaryError(403,'ACCOUNT_PROFILE_UNAVAILABLE');
  const record=rows[0];
  if(!record||typeof record!=='object'||Array.isArray(record))throw new Error('PROFILE_NOT_VALID');
  const role=Reflect.get(record,'role');
  const id=Reflect.get(record,'id');
  const accountStatus=Reflect.get(record,'account_status');
  if(id!==identity.id||(role!=='student'&&role!=='teacher')||accountStatus!=='active')throw new BoundaryError(403,'ACCOUNT_NOT_ACTIVE');
  return { verified:true,userId:identity.id,role,accessToken,accountStatus:'active' };
}
const ports={
  verify:verifyActiveActor,
  readRows:(table:'profiles'|'batches'|'enrollments',token:string,query:Readonly<Record<string,string>>)=>
    readSupabaseRows<unknown>(table,token,query),
};
export function protectedReadRoute(scope:ProtectedScope):(request:Request)=>Promise<Response>{
  return createProtectedReadEndpoint(scope,ports);
}
