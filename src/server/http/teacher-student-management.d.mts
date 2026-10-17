type RowTable='profiles'|'batches'|'enrollments';
type VerifiedActor={verified:boolean;userId:string;accessToken:string;role:string;accountStatus:string};
export function createTeacherStudentManagementEndpoint(ports:{verify:(token:string)=>Promise<VerifiedActor>;readRows:(table:RowTable,token:string,query:Readonly<Record<string,string>>)=>Promise<unknown>}):(request:Request,context?:{params:Promise<{studentId:string}>}|{params:{studentId:string}})=>Promise<Response>;
