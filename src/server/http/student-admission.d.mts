export function createStudentAdmissionRoute(role:'teacher'|'student',ports:{verify:(token:string)=>Promise<unknown>;call:(name:string,token:string,args:Record<string,unknown>)=>Promise<unknown>}):(request:Request)=>Promise<Response>;
export function readSmallJsonBody(request:Request):Promise<unknown>;
