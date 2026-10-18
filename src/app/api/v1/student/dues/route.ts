import {officeReadRoute} from '@/server/http/production-office-reads';
export const GET=officeReadRoute('myDues');
export const dynamic='force-dynamic';
