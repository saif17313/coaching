import { protectedReadRoute } from '@/server/http/production-read-adapter';
export const dynamic = 'force-dynamic';
export const GET = protectedReadRoute('student-me');
