/** New secret API keys travel only as apikey; legacy service JWTs also need Bearer. */
export function authAdminHeaders(secret){
 if(typeof secret!=='string'||secret.length>4096||!(/^sb_secret_[A-Za-z0-9_-]{16,}$/.test(secret)||/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(secret)))return null;
 return {apikey:secret,...(secret.startsWith('sb_secret_')?{}:{Authorization:`Bearer ${secret}`}),'Content-Type':'application/json'};
}
