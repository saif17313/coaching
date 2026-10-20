export function cmsError(code:string,status:number):Error & {code:string;status:number};
export function cmsRpcError(response:Response):Promise<never>;
export function cmsFailure(error:unknown):{status:number;code:string};
