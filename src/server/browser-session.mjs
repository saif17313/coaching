/** Browser-only session boundary. No external request, DB, or framework imports. */
export const COOKIE_NAME = process.env.NODE_ENV === 'production' ? '__Host-musa_access' : 'musa_access_dev';
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
export function validAccessToken(value){return typeof value==='string' && value.length>30 && value.length<=8192 && JWT.test(value);}
export function allowedBrowserMutation({method,origin,url,marker,fetchSite}){
 if(method==='GET'||method==='HEAD'||method==='OPTIONS')return true;
 if(marker!=='1')return false;
 if(fetchSite && !['same-origin','none'].includes(fetchSite))return false;
 if(!origin)return false;
 try{
  const a=new URL(origin),b=new URL(url);
  return (a.protocol==='http:'||a.protocol==='https:')&&a.origin===b.origin;
 }catch{return false;}
}
export function safeSupabaseAuthConfig(env){
 const raw=env.SUPABASE_URL,key=env.SUPABASE_ANON_KEY;
 if(!raw||!key||/[\x00-\x20\x7f]/.test(key)||key.length>4096)throw Error('INVALID_AUTH_CONFIG');
 let root;try{root=new URL(raw);}catch{throw Error('INVALID_AUTH_CONFIG');}
 const hosted=root.protocol==='https:'&&/^[a-z0-9-]+\.supabase\.co$/.test(root.hostname)&&!root.port;
 const local=env.NODE_ENV==='development'&&env.COACHING_LOCAL_SUPABASE_TESTING==='allow-loopback-54321'&&root.protocol==='http:'&&root.hostname==='127.0.0.1'&&root.port==='54321';
 if(!(hosted||local)||root.username||root.password||root.pathname!=='/'||root.search||root.hash)throw Error('INVALID_AUTH_CONFIG');
 return {root,key};
}
export function verifyLoginBody(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='email,password')return false;
 return typeof input.email==='string'&&input.email.length>=3&&input.email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)&&typeof input.password==='string'&&input.password.length>=1&&input.password.length<=512;
}
