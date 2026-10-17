import 'server-only';
import { verifyActiveActor } from './production-read-adapter';
import { readSupabaseRows } from '../supabase/rest';
import { createMemberReadEndpoint, type MemberReadKind } from './member-read.mjs';

/** Uses the same user-scoped Auth token for profile verification and every RLS-scoped query. */
export function protectedMemberReadRoute(kind:MemberReadKind){
  return createMemberReadEndpoint(kind,{
    verify:verifyActiveActor,
    readRows:(table:'profiles'|'batches'|'enrollments',token:string,query:Readonly<Record<string,string>>)=>
      readSupabaseRows<unknown>(table,token,query),
  });
}
