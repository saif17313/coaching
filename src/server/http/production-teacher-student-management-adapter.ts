import 'server-only';
import {createTeacherStudentManagementEndpoint} from './teacher-student-management.mjs';
import {verifyActiveActor} from './production-read-adapter';
import {readSupabaseRows} from '../supabase/rest';

/** Reuse verified teacher session and user-scoped RLS PostgREST reads. */
export const teacherStudentManagementRoute=createTeacherStudentManagementEndpoint({
  verify:verifyActiveActor,
  readRows:(table:'profiles'|'batches'|'enrollments',token:string,query:Readonly<Record<string,string>>)=>readSupabaseRows<unknown>(table,token,query),
});
