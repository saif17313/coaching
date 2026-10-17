export type PublishKind='assignment'|'exam'|'results';
export type PublishCommand={token:string;operationId:string;target:string};
export type AcademicActor={verified:true;userId:string;role:'teacher'|'student';accountStatus:'active';accessToken:string};
export function teacherPublishEndpoint(kind:PublishKind,ports:{verify:(token:string)=>Promise<AcademicActor>;execute:(kind:PublishKind,c:PublishCommand)=>Promise<unknown>}):(request:Request,ctx:{params:Promise<Record<string,string>>})=>Promise<Response>;
export function studentPublishedResultsEndpoint(ports:{verify:(token:string)=>Promise<AcademicActor>;read:(c:{token:string;limit:number;offset:number})=>Promise<unknown>}):(request:Request)=>Promise<Response>;
