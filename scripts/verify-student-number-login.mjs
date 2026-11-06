/** Temporary Auth fixture; verifies the real local app against the connected DB. */
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {authAdminHeaders} from '../src/server/auth-admin-headers.mjs';
const root=process.env.SUPABASE_URL,admin=authAdminHeaders(process.env.SUPABASE_AUTH_ADMIN_KEY);
const app=process.env.EDUCENTRE_TEST_URL||'http://localhost:3000';
if(!root||!admin)throw Error('Server Supabase configuration is required.');
const email=`student-id-check-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url')+'aA1!';
let id,browser;
async function adminRequest(path,options={}){
 const response=await fetch(root+path,{...options,headers:{...admin,...options.headers}});
 if(!response.ok)throw Error(`Fixture request failed (${response.status})`);
 return response;
}
async function login(identifier,secret=password){
 return fetch(app+'/api/portal/auth/login',{method:'POST',headers:{Origin:app,'Content-Type':'application/json','x-musa-ui':'1'},body:JSON.stringify({email:identifier,password:secret})});
}
try{
 const created=await adminRequest('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email,password,email_confirm:true})});
 id=(await created.json()).id;
 await adminRequest('/rest/v1/profiles?id=eq.'+id,{method:'PATCH',body:JSON.stringify({account_status:'active',full_name:'Temporary Student ID Check'})});
 const records=await(await adminRequest('/rest/v1/student_admission_details?student_id=eq.'+id+'&select=admission_roll')).json();
 const number=records[0]?.admission_roll;assert.match(number,/^[1-9][0-9]{9}$/);
 console.log('PASS: Auth signup automatically receives a 10-digit Student ID');
 const wrong=await login(number,password+'wrong');assert.equal(wrong.status,401);
 assert.equal(wrong.headers.get('set-cookie'),null);
 const missing=await login('9999999999');assert.equal(missing.status,401);
 assert.deepEqual(await missing.json(),await wrong.json());
 console.log('PASS: wrong passwords and unknown IDs fail without disclosing student details');
 for(const identifier of [number,email]){
  const signed=await login(identifier);assert.equal(signed.status,200);
  const body=await signed.json();assert.equal(body.data.role,'student');assert.equal(body.data.userId,id);
  assert.equal(JSON.stringify(body).includes(email),false);
  const cookie=signed.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
  const profile=await fetch(app+'/api/v1/student/admission-profile',{headers:{Cookie:cookie}});
  assert.equal(profile.status,200);const data=(await profile.json()).data;
  assert.equal(data.id,id);assert.equal(data.admissionRoll,number);
 }
 console.log('PASS: Student ID and email both sign into the same account and dynamic profile');
 if(process.env.EDUCENTRE_PLAYWRIGHT_MODULE){
  const {pathToFileURL}=await import('node:url');
  const {chromium}=await import(pathToFileURL(process.env.EDUCENTRE_PLAYWRIGHT_MODULE).href);
  browser=await chromium.launch({headless:true});const page=await browser.newPage();
  await page.goto(app+'/portal');
  await page.getByLabel('Email address or Student ID',{exact:true}).fill(number);
  await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:/Sign in securely/}).click();
  await page.locator('.portal-sidebar').getByRole('button',{name:'My profile',exact:true}).click();
  await page.getByText('Student ID: '+number,{exact:true}).waitFor();
  console.log('PASS: actual browser signs in with Student ID and displays it in My profile');
 }
}finally{
 if(browser)await browser.close();
 if(id){
  await adminRequest('/rest/v1/student_admission_details?student_id=eq.'+id,{method:'DELETE'});
  await adminRequest('/auth/v1/admin/users/'+id,{method:'DELETE'});
  // Offline-student support intentionally decouples profiles from auth.users.
  await adminRequest('/rest/v1/profiles?id=eq.'+id,{method:'DELETE'});
  console.log('PASS: temporary student fixture removed');
 }
}
