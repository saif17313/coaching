type CommandKind='student-profile'|'enrollment-request';
type Actor={verified:boolean;userId:string;role:string;accountStatus:string;accessToken:string};
type Command={token:string;operationId:string;target:string|null;data:Readonly<Record<string,unknown>>;actorId:string};
export function createTeacherAdminCommandEndpoint(kind:CommandKind,ports:{verify:(token:string)=>Promise<Actor>;execute:(kind:CommandKind,command:Command)=>Promise<unknown>}):(request:Request,context?:{params:Promise<{studentId:string}>}|{params:{studentId:string}})=>Promise<Response>;
