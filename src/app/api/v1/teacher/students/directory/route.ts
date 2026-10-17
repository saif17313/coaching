import {teacherCoreReadRoute} from '@/server/http/production-teacher-core-reads-adapter';
export const dynamic='force-dynamic';
export const GET=teacherCoreReadRoute('student-directory');
