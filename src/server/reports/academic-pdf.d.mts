export function letterGrade(percent:number):string;
export function examSheetPdf(sheet:unknown):Promise<Buffer>;
export function progressReportPdf(input:{student:{fullName:string;admissionRoll?:string|null};exams:unknown[]}):Promise<Buffer>;
