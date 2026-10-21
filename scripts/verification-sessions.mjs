/** Test credentials stay in memory; callers supply the user's local credential document. */
import {readFileSync} from 'node:fs';
export async function verificationSessions(browser,{origin='http://localhost:3000'}={}){
 if(!['http://localhost:3000','https://educentre-iota.vercel.app'].includes(origin))throw Error('Unreviewed verification origin.');
 const sessions={};const available=[];
 for(const page of browser.contexts().flatMap(context=>context.pages())){
  if(!page.url().startsWith(origin+'/')&&!page.url().startsWith('chrome-error:'))continue;
  if(page.url().startsWith('chrome-error:'))await page.goto(origin+'/portal');
  const role=await page.evaluate(async()=>{const response=await fetch('/api/portal/auth/session');return response.ok?(await response.json()).data?.role:null;});
  if(['teacher','student'].includes(role)&&!sessions[role])sessions[role]=page;else if(!role)available.push(page);
 }
 for(const role of ['teacher','student']){
  if(sessions[role])continue;
  const file=process.env.EDUCENTRE_TEST_CREDENTIAL_FILE;if(!file)throw Error(role+' session required; configure the locally provided credential document.');
  const document=readFileSync(file,'utf8'),password=document.match(/Shared test password:\s*`([^`]+)`/)?.[1],email=document.match(new RegExp((role==='teacher'?'Teacher':'Student')+':\\s*`([^`]+)`'))?.[1];
  if(!email||!password)throw Error('Authorized test credential document is unavailable.');
  const page=available.shift()??await(await browser.newContext()).newPage();
  await page.goto(origin+'/portal');await page.getByLabel('Email address',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);
  const login=page.waitForResponse(response=>response.url().endsWith('/api/portal/auth/login')&&response.request().method()==='POST');await page.getByRole('button',{name:/^Sign in securely/}).click();
  const response=await login;if(response.status()!==200)throw Error(role+' test sign-in failed (HTTP '+response.status()+').');
  const body=await response.json();if(body.data?.role!==role)throw Error('Test account role mismatch.');
  sessions[role]=page;
 }
 return sessions;
}
