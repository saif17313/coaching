export type CmsMediaKind='upload'|'list'|'attach'|'archive'|'publicMedia'|'teacherMedia';
export type MediaPorts={verify?:(token:string)=>Promise<unknown>;call:(name:string,token:string|null,args:Record<string,unknown>)=>Promise<unknown>;upload?:(args:{token:string;key:string;bytes:Uint8Array;contentType:string})=>Promise<void>;readObject?:(args:{key:string;token?:string})=>Promise<Uint8Array>};
export function imageSignature(bytes:Uint8Array|ArrayBuffer,type:string):boolean;
export function createCmsMediaRoute(kind:CmsMediaKind,ports:MediaPorts):(req:Request,ctx?:{params?:Promise<Record<string,string>>})=>Promise<Response>;
