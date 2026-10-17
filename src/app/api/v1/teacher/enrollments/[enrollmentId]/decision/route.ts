import { protectedMutationRoute } from '@/server/http/production-mutation-adapter';
export const dynamic='force-dynamic';
const mutate=protectedMutationRoute('enrollment-decision');
export async function POST(request:Request,context:{params:Promise<{enrollmentId:string}>}){
  return mutate(request,context);
}
