export type Lifecycle='active'|'inactive'|'cancelled'|'completed';
export type DirectoryStudent={id:string;fullName:string;accountStatus:string;admissionRoll:string|null;admittedOn:string|null;phone:string;schoolName:string;className:string;stream:string;academicSession:string;photoMediaId:string|null;guardianName:string;guardianRelationship:string;guardianMobile:string;outstandingMinor:string;batches:{id:string;batchId:string;name:string;status:string}[];lifecycleStatus?:Lifecycle;reviewStatus?:string;loginState?:'none'|'reserved'|'invited'|'linked'};
export type StudentDirectory={students:DirectoryStudent[];total:number;limit:number;offset:number;classes:string[];metrics:{total:number;active:number;newAdmissions:number;pendingDues:number;inactive?:number;cancelled?:number;completed?:number}};
export const LIFECYCLE:Lifecycle[];
export function validateStudentDirectory(value:unknown):StudentDirectory;
