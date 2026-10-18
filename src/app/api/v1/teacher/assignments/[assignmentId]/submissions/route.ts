import {studentWorkflowRoute} from '@/server/http/production-student-workflows';
export const GET=studentWorkflowRoute('submissionList');
export const dynamic='force-dynamic';
