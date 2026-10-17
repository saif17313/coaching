type Table='profiles'|'batches'|'enrollments';
type Actor={verified:boolean;userId:string;accessToken:string;role:string;accountStatus:string};
export type TeacherCoreKind='batch-roster'|'batch-occupancy'|'enrollment-detail'|'student-directory';
export function createTeacherCoreReadEndpoint(kind:TeacherCoreKind,ports:{verify:(token:string)=>Promise<Actor>;readRows:(table:Table,token:string,query:Readonly<Record<string,string>>)=>Promise<unknown>;countBatch?:(token:string,batchId:string,status:'active'|'pending')=>Promise<number>}):(req:Request,ctx?:{params:Promise<Record<string,string>>}|{params:Record<string,string>})=>Promise<Response>;
