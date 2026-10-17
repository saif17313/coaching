export type OverviewTable='profiles'|'batches'|'enrollments';
export type OverviewFilter='students-total'|'students-active'|'students-pending'|'batches-open'|'enrollments-pending'|'enrollments-active';
export type OverviewActor={verified:boolean;userId:string;accessToken:string;role:string;accountStatus:string};
export function createTeacherOverviewEndpoint(ports:{verify:(token:string)=>Promise<OverviewActor>;countRows:(table:OverviewTable,token:string,filter:OverviewFilter)=>Promise<number>}):(request:Request)=>Promise<Response>;
