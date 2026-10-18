import {officeReadRoute} from '@/server/http/production-office-reads';
export const GET=officeReadRoute('batchDues');
export const dynamic='force-dynamic';
