export class RpcError extends Error {code:string;status:number;constructor(code:string,status:number);}
export function domainRpcError(response:Response):Promise<never>;
