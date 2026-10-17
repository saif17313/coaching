import {teacherAcademicRoute} from '@/server/http/production-teacher-academic-adapter';
export const dynamic='force-dynamic';
const handler=teacherAcademicRoute('syllabus');
export async function GET(request:Request,context:{params:Promise<{subjectId:string}>}){return handler(request,context);}
