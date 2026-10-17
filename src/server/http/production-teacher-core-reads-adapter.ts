import 'server-only';
import {createTeacherCoreReadEndpoint,type TeacherCoreKind} from './teacher-core-reads.mjs';
import {verifyActiveActor} from './production-read-adapter';
import {readSupabaseRows} from '../supabase/rest';
import {countTeacherBatchEnrollments} from '../supabase/batch-count';
/** Same verified JWT for Auth, teacher role check, RLS SELECT and HEAD-count. */
export function teacherCoreReadRoute(kind:TeacherCoreKind){
 return createTeacherCoreReadEndpoint(kind,{
  verify:verifyActiveActor,
  readRows:(table:'profiles'|'batches'|'enrollments',token:string,query:Readonly<Record<string,string>>)=>readSupabaseRows<unknown>(table,token,query),
  countBatch:countTeacherBatchEnrollments,
 });
}
