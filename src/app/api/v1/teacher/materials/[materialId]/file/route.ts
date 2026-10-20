import {learningMaterialRoute} from '@/server/http/production-learning-materials';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=learningMaterialRoute('teacherFile');
