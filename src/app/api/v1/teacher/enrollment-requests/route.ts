import {teacherEnrollmentRequestRoute} from '@/server/http/production-teacher-admin-commands';
export const dynamic='force-dynamic';
export async function POST(request:Request){return teacherEnrollmentRequestRoute(request);}
