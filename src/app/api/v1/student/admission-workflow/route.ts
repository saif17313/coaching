import {studentWorkflowRoute} from '@/server/http/production-student-admission';
export const dynamic='force-dynamic';
export const GET=studentWorkflowRoute('student');
export const POST=studentWorkflowRoute('student');
