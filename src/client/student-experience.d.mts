export type StudentMode='dashboard'|'batches'|'subjects'|'syllabus'|'routine'|'assignments'|'assignment'|'ownSubmission'|'exams'|'exam'|'materials'|'announcements'|'notifications'|'unread'|'results'|'progress'|'billing'|'dues'|'payments'|'profile'|'calendar';
export type StudentCommand='submit'|'notificationRead'|'profile';
export type StudentItem=Record<string,unknown>&{id:string};
export function studentRead(kind:StudentMode,target?:string,options?:{offset?:number;limit?:number;billPeriod?:string;from?:string;to?:string},fetchImpl?:typeof fetch):Promise<unknown>;
export function studentCommand(kind:StudentCommand,target:string,body:Record<string,unknown>,fetchImpl?:typeof fetch,uuid?:()=>string):Promise<Record<string,unknown>>;
export function studentBillingCsv(periodValue:string):string;
export const studentModes:ReadonlyArray<string>;
