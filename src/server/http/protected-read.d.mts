export type ProtectedScope = 'student-me'|'student-enrollments'|'teacher-students'|'teacher-batches';
export type VerifiedReadActor = { verified:true; userId:string; role:'student'|'teacher'; accessToken:string };
export type ReadParams = Readonly<Record<string,string>>;
export type ProtectedReadDeps = {
  verify: (token:string)=>Promise<VerifiedReadActor>;
  readRows: (table:'profiles'|'enrollments'|'batches',token:string,query:ReadParams)=>Promise<unknown[]>;
};
export declare class BoundaryError extends Error { constructor(status:number,code:string); readonly status:number; readonly code:string; }
export declare function createProtectedReadEndpoint(kind:ProtectedScope,deps:ProtectedReadDeps): (request:Request)=>Promise<Response>;
