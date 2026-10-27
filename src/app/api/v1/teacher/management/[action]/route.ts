import {managementCommand,managementRead} from '@/server/http/management-route';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=managementRead('teacher');
export const POST=managementCommand;
