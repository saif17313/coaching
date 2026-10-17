export type MutationKind='student-status'|'enrollment-decision'|'batch-create'|'batch-update';
export type VerifiedMutationActor={verified:true;userId:string;role:'student'|'teacher';accountStatus:string;accessToken:string};
export type MutationInput=Readonly<Record<string,unknown>>;
export type MutationCommand={actor:{id:string;role:'teacher';verified:true};token:string;operationId:string;target:string|null;input:MutationInput};
export declare class MutationBoundaryError extends Error {constructor(status:number,code:string); readonly status:number;readonly code:string;}
export declare function createProtectedMutationEndpoint(kind:MutationKind,deps:{verify:(token:string)=>Promise<VerifiedMutationActor>;execute:(kind:MutationKind,command:MutationCommand)=>Promise<unknown>}): (req:Request,context?:{params?:Promise<Record<string,string>>|Record<string,string>})=>Promise<Response>;
