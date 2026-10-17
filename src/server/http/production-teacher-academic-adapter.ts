import 'server-only';
import {createTeacherAcademicEndpoint,type TeacherAcademicKind} from './teacher-academic-reads.mjs';
import {verifyActiveActor} from './production-read-adapter';
import {readSupabaseRows} from '../supabase/rest';
import {readSupabaseAcademicRows} from '../supabase/academic-read';

/** Verified user JWT goes unchanged to every PostgREST query; no service role. */
export function teacherAcademicRoute(kind:TeacherAcademicKind){
 return createTeacherAcademicEndpoint(kind,{
  verify:verifyActiveActor,
  readRows:(table,token,query)=>table==='batches'?readSupabaseRows('batches',token,query):readSupabaseAcademicRows(table,token,query),
 });
}
