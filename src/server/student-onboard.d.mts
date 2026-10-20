export function validStudentOnboard(input:unknown):input is {email:string;fullName:string;initialPassword:string};
export function validSignupResult(payload:unknown,email:string):boolean;
export function signupFailure(status:number,payload:unknown):{status:number;code:string};
