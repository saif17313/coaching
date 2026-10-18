export type StudentAcademicKind='subjects'|'syllabus'|'routine'|'assignments'|'assignment'|'exams'|'exam';
export type StudentAcademicActor={verified:boolean;userId:string;accessToken:string;accountStatus:string;role:string};
export declare const studentAcademicKinds:ReadonlyArray<StudentAcademicKind>;
export declare function createStudentAcademicEndpoint(kind:StudentAcademicKind,ports:{
 verify:(token:string)=>Promise<StudentAcademicActor|null>;
 readRows:(table: "enrollments"|"academic_subjects"|"syllabus_units"|"routine_slots"|"academic_assignments"|"exams",token:string,query:Readonly<Record<string,string>>)=>Promise<unknown[]>;
 now?:()=>number;
}):(request:Request,context?:{params?:Promise<Record<string,string>>|Record<string,string>})=>Promise<Response>;
