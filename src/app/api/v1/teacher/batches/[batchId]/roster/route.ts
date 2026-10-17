import {teacherCoreReadRoute} from '@/server/http/production-teacher-core-reads-adapter';
export const dynamic='force-dynamic';
const handler=teacherCoreReadRoute('batch-roster');
export async function GET(request:Request,context:{params:Promise<{batchId:string}>}){return handler(request,context);}
