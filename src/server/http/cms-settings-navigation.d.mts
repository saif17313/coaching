export type CmsSettingsKind='settingsRead'|'settingsUpdate'|'settingsPublish'|'archive'|'navigation';
export type CmsSettingsCall=(name:string,token:string|null,args:Record<string,unknown>)=>Promise<unknown>;
export function createCmsSettingsRoute(kind:CmsSettingsKind,ports:{verify?:(token:string)=>Promise<unknown>;call:CmsSettingsCall}):(req:Request,context?:{params?:Promise<Record<string,string>>})=>Promise<Response>;
