import {demoWorkspaceRoute} from '@/server/http/production-student-admission';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const GET=demoWorkspaceRoute('student');
export const POST=demoWorkspaceRoute('student');
