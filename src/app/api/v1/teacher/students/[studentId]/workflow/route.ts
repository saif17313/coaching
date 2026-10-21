import {studentWorkflowRoute} from '@/server/http/production-student-admission';
export const dynamic='force-dynamic';
export const GET=studentWorkflowRoute('teacher');
export const POST=studentWorkflowRoute('teacher');
