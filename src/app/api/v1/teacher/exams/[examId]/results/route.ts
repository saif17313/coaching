import {teacherAcademicRoute} from '@/server/http/production-teacher-academic-adapter';
export const dynamic='force-dynamic';
const handler=teacherAcademicRoute('results');
export async function GET(request:Request,context:{params:Promise<{examId:string}>}){return handler(request,context);}
