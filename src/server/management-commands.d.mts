type Entry={rpc:string;keys:string[];args:(query:URLSearchParams)=>Record<string,unknown>};
type Command={rpc:string;valid:(body:unknown)=>boolean;args:(body:never,operation:string)=>Record<string,unknown>};
export function isUuid(value:unknown):value is string;
export const TEACHER_READS:Record<string,Entry>;
export const STUDENT_READS:Record<string,Entry>;
export const TEACHER_COMMANDS:Record<string,Command>;
export function parseRead(table:Record<string,Entry>,action:string,query:URLSearchParams):{rpc:string;args:Record<string,unknown>};
export function parseCommand(action:string,body:unknown,operation:string):{rpc:string;args:Record<string,unknown>};
export function managementFailure(status:number,body:unknown):{status:number;code:string};
