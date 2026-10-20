export type CmsGroup={label:string;keys:string[]};
export function cmsFieldGroups(key:string,properties:Record<string,unknown>|undefined,item?:boolean):CmsGroup[];
