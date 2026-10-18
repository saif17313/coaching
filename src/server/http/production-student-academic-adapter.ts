import 'server-only';
import {createStudentAcademicEndpoint,type StudentAcademicKind} from './student-academic-reads.mjs';
import {verifyActiveActor} from './production-read-adapter';
import {readSupabaseRows} from '../supabase/rest';
import {readSupabaseAcademicRows} from '../supabase/academic-read';
/** All reads use the verified user's own JWT and RLS. No privileged key. */
export function studentAcademicRoute(kind:StudentAcademicKind){
 return createStudentAcademicEndpoint(kind,{
  verify:verifyActiveActor,
  readRows:(table,token,query)=>table==='enrollments'
   ?readSupabaseRows('enrollments',token,query)
   :readSupabaseAcademicRows(table,token,query),
 });
}
