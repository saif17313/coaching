export type MemberReadKind='student-batches'|'student-batch'|'teacher-enrollments'|'teacher-student'|'teacher-batch';
export type MemberReadActor={verified:true;userId:string;role:'student'|'teacher';accountStatus:'active';accessToken:string};
export declare function createMemberReadEndpoint(kind:MemberReadKind,ports:{
  verify:(token:string)=>Promise<MemberReadActor>;
  readRows:(table:'profiles'|'batches'|'enrollments',token:string,query:Readonly<Record<string,string>>)=>Promise<unknown[]>;
}):(request:Request,context?:{params?:Promise<Record<string,string>>|Record<string,string>})=>Promise<Response>;
