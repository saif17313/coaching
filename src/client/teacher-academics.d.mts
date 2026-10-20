export type AcademicMode='subjects'|'syllabus'|'routine'|'assignments'|'exams'|'results';
export type AcademicCommand='subject'|'syllabus'|'routine'|'assignment'|'exam'|'result';
export type AcademicPublish='assignment'|'exam'|'results';
export type AcademicItem={id:string;[key:string]:unknown};
export function academicList(scope:AcademicMode,target:string,opts?:{offset?:number;limit?:number},fetchImpl?:typeof fetch):Promise<{items:AcademicItem[];pagination:{offset:number;limit:number};[key:string]:unknown}>;
export function academicCommand(kind:AcademicCommand,target:string,input:Record<string,unknown>,fetchImpl?:typeof fetch,uuid?:()=>string):Promise<unknown>;
export function academicPublish(kind:AcademicPublish,target:string,fetchImpl?:typeof fetch,uuid?:()=>string):Promise<unknown>;
export function activeBatchRoster(batchId:string,opts?:{offset?:number},fetchImpl?:typeof fetch):Promise<{id:string;name:string}[]>;
export const academicModes:readonly AcademicMode[];
