import {managementRead} from '@/server/http/management-route';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=managementRead('student');
