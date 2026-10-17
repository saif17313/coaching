type Actor={verified:boolean;userId:string;role:string;accountStatus:string;accessToken:string};
type Table='batches'|'academic_subjects'|'syllabus_units'|'routine_slots'|'academic_assignments'|'exams'|'exam_results';
export type TeacherAcademicKind='subjects'|'syllabus'|'routine'|'assignments'|'exams'|'results';
export function createTeacherAcademicEndpoint(kind:TeacherAcademicKind,ports:{verify:(token:string)=>Promise<Actor>;readRows:(table:Table,token:string,query:Readonly<Record<string,string>>)=>Promise<unknown>}):(req:Request,context:{params:Promise<Record<string,string>>})=>Promise<Response>;
