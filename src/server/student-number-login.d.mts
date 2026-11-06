export function isStudentNumber(value:unknown):value is string;
export function resolveStudentLoginEmail(identifier:string,options:{root:URL|string;adminKey?:string;fetchImpl?:typeof fetch}):Promise<string>;
