export type AdmissionProfile={id:string;fullName:string;email:string;accountStatus:string;revision:number;admissionRoll:string|null;admittedOn:string|null;personal:{phone:string;dateOfBirth:string|null;photoMediaId:string|null;schoolName:string;className:string;stream:string;academicSession:string;presentAddress:string;district:string};guardian:{fullName:string;relationship:string;mobile:string;emergencyContact?:string};admissionDueId:string|null;enrollments:{id:string;batchId:string;batchName:string;status:string}[];feePlans:{id:string;batchId:string;billPeriod:string;amountMinor:number;currency:string;label:string}[]};
export const admissionFields:Readonly<Record<string,number>>;
export const selfAdmissionFields:ReadonlyArray<string>;
export function admissionId(value:unknown):value is string;
export function validateAdmissionChanges(data:unknown,role:string):Record<string,string|null>;
export function validateAdmissionProfile(value:unknown,id:string,role:string):AdmissionProfile;
