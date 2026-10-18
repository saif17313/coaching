import {studentWorkflowRoute} from '@/server/http/production-student-workflows';
export const GET=studentWorkflowRoute('ownSubmission');
export const dynamic='force-dynamic';
