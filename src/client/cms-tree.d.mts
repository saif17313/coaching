import type {FieldSchema} from './cms-fields.mjs';
export type CmsNode={id:string;label:string;type:string;pageId:string;sectionId?:string;itemId?:string;schemaKey?:string|null;scope?:string;path?:(string|number)[];keys?:string[];children?:CmsNode[]};
export function valueAt(value:unknown,path:(string|number)[]):unknown;
export function replaceAt(value:unknown,path:(string|number)[],next:unknown):unknown;
export function schemaAt(schema:FieldSchema,path:(string|number)[]):FieldSchema|undefined;
export function cmsTree(pages:unknown[]):CmsNode[];
export function sectionTree(page:unknown,section:unknown):CmsNode;
export function findNode(nodes:CmsNode[],id:string,ancestors?:CmsNode[]):{node:CmsNode;ancestors:CmsNode[]}|null;
export function filterTree(nodes:CmsNode[],query:string):CmsNode[];
