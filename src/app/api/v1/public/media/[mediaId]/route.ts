import {cmsMediaRoute} from '@/server/http/production-cms-media';
export const runtime='nodejs';
export const GET=cmsMediaRoute('publicMedia');
