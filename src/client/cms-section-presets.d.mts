export interface SectionPreset{kind:string;label:string;heading:string;hint:string}
export declare const SECTION_PRESETS:readonly SectionPreset[];
export declare function sectionPreset(kind:string):SectionPreset|null;
export interface EditorialAuditCheck{key:string;label:string;ok:boolean}
export interface EditorialPageShape{seoTitle:string;seoDescription:string;sections:{kind:string;heading:string;visible:boolean;items:{visible:boolean}[]}[]}
export declare function cmsEditorialAudit(page:EditorialPageShape|null):{checks:EditorialAuditCheck[];score:number};
