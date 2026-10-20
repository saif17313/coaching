export function validPdfFilename(value:unknown):boolean;
export function validPdfBytes(value:unknown):boolean;
export function validMaterialCommand(value:unknown):boolean;
export function materialBytes(request:Request|Response):Promise<Uint8Array>;
export type LearningMaterialKind='upload'|'write'|'teacherFile'|'studentFile';
export function createLearningMaterialRoute(kind:LearningMaterialKind,ports:{verify:(token:string)=>Promise<unknown>;call:(name:string,token:string,args:Record<string,unknown>)=>Promise<unknown>;upload:(value:{token:string;key:string;bytes:Uint8Array})=>Promise<void>;readObject:(value:{token:string;key:string})=>Promise<Uint8Array>}):(request:Request,context?:{params?:Promise<Record<string,string>>})=>Promise<Response>;
