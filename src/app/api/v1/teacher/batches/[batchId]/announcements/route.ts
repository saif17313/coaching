import {officeReadRoute} from '@/server/http/production-office-reads';
export const GET=officeReadRoute('announcements');
export const dynamic='force-dynamic';
