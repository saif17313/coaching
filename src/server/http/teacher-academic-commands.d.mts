export type AcademicKind='subject-create'|'syllabus-add'|'routine-create'|'assignment-draft'|'exam-draft'|'result-draft';
export type AcademicCommand={token:string;operationId:string;target:string;data:Readonly<Record<string,unknown>>;actorId:string};
export declare function createAcademicCommand(kind:AcademicKind,ports:{verify:(token:string)=>Promise<unknown>;execute:(kind:AcademicKind,command:AcademicCommand)=>Promise<unknown>}):(request:Request,ctx?:{params?:Promise<Record<string,string>>})=>Promise<Response>;
