import { protectedMemberReadRoute } from '@/server/http/production-member-read-adapter';
export const dynamic = 'force-dynamic';
export const GET = protectedMemberReadRoute('student-batches');
