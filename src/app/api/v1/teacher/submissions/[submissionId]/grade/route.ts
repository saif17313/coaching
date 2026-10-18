import {studentWorkflowRoute} from '@/server/http/production-student-workflows';
export const POST=studentWorkflowRoute('grade');
export const dynamic='force-dynamic';
