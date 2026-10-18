import {officeReadRoute} from '@/server/http/production-office-reads';
export const GET=officeReadRoute('myPayments');
export const dynamic='force-dynamic';
