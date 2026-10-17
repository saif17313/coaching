import { protectedMutationRoute } from '@/server/http/production-mutation-adapter';
export const dynamic='force-dynamic';
const mutate=protectedMutationRoute('batch-update');
export async function PATCH(request:Request,context:{params:Promise<{batchId:string}>}){
  return mutate(request,context);
}
