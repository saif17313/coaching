import {teacherStudentManagementRoute} from '@/server/http/production-teacher-student-management-adapter';
export const dynamic='force-dynamic';
const handler=teacherStudentManagementRoute;
export async function GET(request:Request,context:{params:Promise<{studentId:string}>}){
  return handler(request,context);
}
