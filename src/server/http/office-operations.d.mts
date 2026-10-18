export type OfficeOpKind='expenseCreate'|'expenseReverse'|'announcementEdit'|'announcementArchive'|'expenseList'|'expenseDetail'|'statement'|'statementCsv'|'expensesCsv';
export type OfficeOpCall={target:string;token:string;operationId:string|null;data:Record<string,unknown>;period?:string;limit:number;offset:number};
export function createOfficeOperationsRoute(kind:OfficeOpKind,ports:{verify:(token:string)=>Promise<unknown>;call:(kind:OfficeOpKind,context:OfficeOpCall)=>Promise<unknown>}):(request:Request,context?:{params?:Promise<Record<string,string>>})=>Promise<Response>;
