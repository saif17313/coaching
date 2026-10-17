import {teacherAcademicRoute} from '@/server/http/production-teacher-academic-adapter';
export const dynamic='force-dynamic';
const handler=teacherAcademicRoute('exams');
export async function GET(request:Request,context:{params:Promise<{batchId:string}>}){return handler(request,context);}
