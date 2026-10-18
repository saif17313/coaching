export type OfficeReadKind='materials'|'announcements'|'feePlans'|'batchDues'|'studentDuesTeacher'|'studentPaymentsTeacher'|'duePayments'|'dueAdjustments'|'myDues'|'myPayments'|'teacherNotifications'|'myNotifications'|'audit'|'studentMaterials'|'studentAnnouncements';
export type OfficePorts={verify:(token:string)=>Promise<unknown>,readRows:(table:string,token:string,query:Readonly<Record<string,string>>)=>Promise<unknown[]>};
export function createOfficeReadEndpoint(kind:OfficeReadKind,ports:OfficePorts):(req:Request,ctx?:{params?:Promise<Record<string,string>>})=>Promise<Response>;
export function createFinanceReportEndpoint(ports:OfficePorts):(req:Request,ctx?:{params?:Promise<Record<string,string>>})=>Promise<Response>;
