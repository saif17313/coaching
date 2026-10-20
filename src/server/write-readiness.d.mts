/** Server-only, nonsecret write-readiness status. Does not grant mutations. */
export type CmsWriteReadiness = Readonly<{
  writable: boolean;
  mutationVerified: boolean;
  runtime: 'local-development' | 'deployment';
  scope: 'active-teacher-jwt-and-supabase-rls';
  detail: string;
}>;
export function cmsWriteReadiness(env: Readonly<Record<string, string | undefined>> | undefined): CmsWriteReadiness;
export function createWriteStatusRoute(ports:{verify:(token:string)=>Promise<unknown>;probe:(token:string)=>Promise<unknown>;env:Readonly<Record<string,string|undefined>>}):(req:Request)=>Promise<Response>;
