export type FieldSchema={type?:'string'|'integer'|'boolean'|'object'|'array';oneOf?:FieldSchema[];title?:string;maxLength?:number;maxItems?:number;minimum?:number;maximum?:number;pattern?:string;enum?:string[];media?:boolean;relation?:boolean;link?:boolean;properties?:Record<string,FieldSchema>;items?:FieldSchema;additionalProperties?:boolean;uniqueItems?:boolean};
export type CmsForm={key:string;label:string;kind:string;section:FieldSchema;item:FieldSchema};
export const CMS_FORMS:Readonly<Record<string,CmsForm>>;
export function validateSchema(value:unknown,schema:FieldSchema):boolean;
export function validateCmsFields(key:string,value:unknown,item?:boolean):boolean;
export function safeContentUrl(value:string):boolean;
export function formForTarget(target:{slug:string|null;kind:string|null;label:string;id?:string}|undefined):string|null;
