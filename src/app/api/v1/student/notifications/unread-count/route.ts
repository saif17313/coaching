import {studentWorkflowRoute} from '@/server/http/production-student-workflows';
export const GET=studentWorkflowRoute('unreadCount');
export const dynamic='force-dynamic';
