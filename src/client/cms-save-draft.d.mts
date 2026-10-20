import type {CmsOperation} from './cms-studio.mjs';
export type CmsDraftStep={kind:'pageUpdate'|'section'|'item'|'fields';params:{sectionId?:string;itemId?:string;payload:Record<string,unknown>}};
export function saveCmsDraft(pageId:string,revision:number,steps:CmsDraftStep[],call?:(kind:CmsOperation,params?:Record<string,unknown>)=>Promise<unknown>):Promise<unknown>;
