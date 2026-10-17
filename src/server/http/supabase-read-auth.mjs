/* Verification always calls Supabase Auth /user (hosted in production, exact loopback only in opted-in development). No local JWT decoding. */
export class AuthUnavailableError extends Error {constructor(){super('AUTH_NOT_CONFIGURED');this.code='AUTH_NOT_CONFIGURED';}}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function verifySupabaseUser(token,{projectUrl,anonKey,fetchImpl=fetch}={}){
  if(!projectUrl||!anonKey)throw new AuthUnavailableError();
  let url;
  try{url=new URL(projectUrl);}catch{throw new AuthUnavailableError();}
  // Production is hosted HTTPS only. Development permits exactly the dedicated Supabase loopback port,
  // only with a separate explicit opt-in. No arbitrary HTTP hosts, DNS, redirects or URL paths.
  const local = process.env.NODE_ENV === 'development' &&
    process.env.COACHING_LOCAL_SUPABASE_TESTING === 'allow-loopback-54321' &&
    url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port === '54321';
  const hosted = url.protocol === 'https:' && /^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) && !url.port;
  if(!(hosted||local)||url.username||url.password||url.pathname!=='/'||url.search||url.hash||
     typeof anonKey!=='string'||/[\r\n]/.test(anonKey)||anonKey.length>4096)throw new AuthUnavailableError();
  if(typeof token!=='string'||token.length>8192||/[\s,]/.test(token))throw new AuthUnavailableError();
  const endpoint=new URL('/auth/v1/user',url);
  let result;
  try{
    result=await fetchImpl(endpoint,{
      method:'GET',headers:{apikey:anonKey,Authorization:`Bearer ${token}`,Accept:'application/json'},
      cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)
    });
  }catch{throw new AuthUnavailableError();}
  if(result.status===401||result.status===403)return null;
  if(!result.ok)throw new AuthUnavailableError();
  let body;
  try{body=await result.json();}catch{throw new AuthUnavailableError();}
  if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.id!=='string'||!uuid.test(body.id))throw new AuthUnavailableError();
  // Deliberately ignore app_metadata/user_metadata: DB profile is sole authority for role.
  return {id:body.id};
}
