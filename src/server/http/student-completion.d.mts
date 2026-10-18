export type StudentCompletionKind='dashboard'|'profile'|'profileUpdate'|'billing'|'billingCsv'|'calendar'|'progress';
export declare const studentCompletionKinds:ReadonlyArray<StudentCompletionKind>;
export declare function createStudentCompletionRoute(kind:StudentCompletionKind,ports:{verify:(token:string)=>Promise<unknown>;call:(name:string,token:string,args:Record<string,unknown>)=>Promise<unknown>}):(req:Request)=>Promise<Response>;
