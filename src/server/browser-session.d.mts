export const COOKIE_NAME:string;
export function validAccessToken(value:unknown):value is string;
export function allowedBrowserMutation(input:{method:string;origin:string|null;url:string;marker:string|null;fetchSite:string|null}):boolean;
export function safeSupabaseAuthConfig(env:NodeJS.ProcessEnv):{root:URL;key:string};
export function verifyLoginBody(input:unknown):input is {email:string;password:string};
