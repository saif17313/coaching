export type OfficeKind='plan'|'dues'|'payment'|'waiver'|'refund'|'announcement'|'publish'|'notify';
export type OfficeCommand={token:string;operationId:string;target:string;data:Readonly<Record<string,unknown>>;actorId:string};
export declare function createOfficeCommand(kind:OfficeKind,ports:{verify:(token:string)=>Promise<unknown>;execute:(kind:OfficeKind,c:OfficeCommand)=>Promise<unknown>}):(request:Request,context?:{params?:Promise<Record<string,string>>})=>Promise<Response>;
