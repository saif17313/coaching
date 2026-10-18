export type CmsKind='list'|'detail'|'create'|'update'|'section'|'item'|'publish'|'publicPage'|'settings';
export type CmsCall=(name:string,token:string|null,args:Record<string,unknown>)=>Promise<unknown>;
export function createCmsRoute(kind:CmsKind,ports:{verify?:(token:string)=>Promise<unknown>;call:CmsCall}):(req:Request,context?:{params?:Promise<Record<string,string>>})=>Promise<Response>;
