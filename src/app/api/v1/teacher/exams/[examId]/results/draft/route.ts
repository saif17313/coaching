import { academicResultDraft } from '@/server/http/production-teacher-academic-commands';
export const dynamic='force-dynamic';
export async function POST(request:Request,ctx:{params:Promise<Record<string,string>>}){return academicResultDraft(request,ctx);}
