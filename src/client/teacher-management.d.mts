export type TeacherManagementScope='students'|'batches'|'enrollments';
export type TeacherAction='createBatch'|'updateBatch'|'renameStudent'|'changeStudentStatus'|'requestEnrollment'|'decideEnrollment';
export type TeacherRow={id:string;name?:string;code?:string;capacity?:number;archived?:boolean;status?:string;studentId?:string;batchId?:string};
export function readTeacherList(scope:TeacherManagementScope,options?:{offset?:number;filter?:string}):Promise<unknown>;
export function teacherCommand(kind:TeacherAction,request:{id?:string;input:Record<string,unknown>}):Promise<unknown>;
export function normalizeTeacherList(scope:TeacherManagementScope,data:unknown):TeacherRow[];
