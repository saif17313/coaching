import { protectedMutationRoute } from '@/server/http/production-mutation-adapter';
export const dynamic='force-dynamic';
export const POST=protectedMutationRoute('batch-create');
