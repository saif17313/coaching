import {teacherBatchDirectoryRoute} from '@/server/http/production-student-admission';
export const dynamic='force-dynamic';
export async function GET(request:Request){return teacherBatchDirectoryRoute(request);}
