import { protectedMutationRoute } from '@/server/http/production-mutation-adapter';
export const dynamic='force-dynamic';
const mutate=protectedMutationRoute('student-status');
export async function PATCH(request:Request,context:{params:Promise<{studentId:string}>}){
  return mutate(request,context);
}
