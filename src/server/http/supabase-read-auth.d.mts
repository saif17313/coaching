export declare class AuthUnavailableError extends Error {readonly code:'AUTH_NOT_CONFIGURED';}
export declare function verifySupabaseUser(token:string,options?:{
  projectUrl?:string; anonKey?:string; fetchImpl?:typeof fetch
}):Promise<{id:string}|null>;
