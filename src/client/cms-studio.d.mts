export type CmsKind='hero'|'rich-text'|'cards'|'gallery'|'results'|'courses'|'contact'|'cta'|'faq'|'news'|'reviews'|'academic-calendar'|'routine'|'materials'|'footer';
export declare const CMS_KINDS:readonly CmsKind[];
export class CmsRequestError extends Error {code:string;status:number;constructor(code:string,status:number,message:string);}
export function cmsResponseError(status:number,value:unknown):CmsRequestError;
export type CmsOperation='pages'|'media'|'mediaArchive'|'settings'|'page'|'pageCreate'|'pageUpdate'|'publish'|'archive'|'section'|'item'|'fields'|'organize'|'attach'|'settingsUpdate'|'settingsPublish';
export declare function cmsRequest(kind:CmsOperation,params?:Record<string,unknown>):{path:string;method:string;body:unknown};
export declare function cmsFetch(kind:CmsOperation,params?:Record<string,unknown>,fetcher?:typeof fetch,uuid?:()=>string):Promise<unknown>;
export declare function validateCmsPage<T>(x:T):T;
