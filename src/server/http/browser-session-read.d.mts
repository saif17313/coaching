export function createBrowserSessionRead(ports:{verify:(token:string)=>Promise<unknown>;tokenOf:(request:Request)=>unknown}):(request:Request)=>Promise<Response>;
