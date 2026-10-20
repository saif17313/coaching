export type FinanceMode='finance'|'plans'|'dues'|'expenses';
export type FinanceCommand='plan'|'generate'|'payment'|'waiver'|'refund'|'expense'|'reverse';
export type FinanceItem={id:string;[key:string]:unknown};
export function parseBDTToMinor(value:string):number;
export function minorToBDT(value:number|string):string;
export function financeList(kind:FinanceMode|'duePayments'|'dueAdjustments',target:string,opts?:{billPeriod?:string;offset?:number;limit?:number},fetchImpl?:typeof fetch):Promise<{items:FinanceItem[];batch?:Record<string,unknown>;total?:number;[key:string]:unknown}>;
export function financeCommand(kind:FinanceCommand,target:string,input:Record<string,unknown>,fetchImpl?:typeof fetch,uuid?:()=>string):Promise<Record<string,unknown>>;
export function financeCsv(kind:'cashflow'|'expenses',batchId:string,billPeriod:string):string;
export const financeKinds:readonly string[];
