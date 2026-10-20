import {cmsMediaRoute} from '@/server/http/production-cms-media';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=cmsMediaRoute('teacherMedia');
