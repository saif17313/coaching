import {teacherStudentProfileRoute} from '@/server/http/production-teacher-admin-commands';
export const dynamic='force-dynamic';
export async function PATCH(request:Request,context:{params:Promise<{studentId:string}>}){
  return teacherStudentProfileRoute(request,context);
}
