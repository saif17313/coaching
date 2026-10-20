import {teacherAccountRoute} from '@/server/http/production-student-admission';
export const dynamic='force-dynamic';
export async function GET(request:Request){return teacherAccountRoute(request);}
export async function PATCH(request:Request){return teacherAccountRoute(request);}
