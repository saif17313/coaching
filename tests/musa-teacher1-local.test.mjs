import assert from 'node:assert/strict';
import test from 'node:test';
import {createLocalTeacher, promotionSQL, EMAIL} from '../scripts/musa-teacher1-local-bootstrap.mjs';

const ID = '123e4567-e89b-42d3-a456-426614174000';
const token = 'aaa.bbb.ccc';
function mocked(overrides={}) {
  const calls = {creates: 0, deletes: 0, promotions: 0, logins: 0};
  const options = {
    password: 'LocalTest9!',
    db(sql) {
      if (sql.includes('to_regclass')) return 'READY';
      if (sql.includes('SELECT count(*)')) return '0';
      if (sql.includes('BEGIN;')) {calls.promotions++; return 'OK';}
      if (sql.includes('SELECT role::text')) return 'teacher:active';
      throw new Error('Unexpected query');
    },
    async adminCreate(body) {calls.creates++; assert.equal(body.email,EMAIL); assert.equal(body.email_confirm,true);return {status:201,data:{id:ID}};},
    async adminDelete(id) {calls.deletes++; assert.equal(id,ID); return {status:204,data:null};},
    async passwordLogin(body) {calls.logins++;assert.equal(body.password,'LocalTest9!');return {status:200,data:{access_token:token}};},
    async authMe(access) {assert.equal(access,token);return {status:200,data:{id:ID}};},
  };
  return [{...options,...overrides},calls];
}
test('creates only the requested teacher, with audited profile and valid Supabase login',async()=>{
  const [opts,calls]=mocked();
  const result=await createLocalTeacher(opts);
  assert.equal(result.email,EMAIL);assert.equal(result.role,'teacher');assert.equal(result.status,'active');
  assert.deepEqual(calls,{creates:1,deletes:0,promotions:1,logins:1});
  assert.match(promotionSQL(ID),/LOCAL_TEACHER1_BOOTSTRAP/);
  assert.throws(()=>promotionSQL("'); DROP TABLE auth.users; --"),/Invalid returned Auth user UUID/);
});
test('existing Auth user stops without resetting credentials',async()=>{
  const [opts,calls]=mocked({db(sql){return sql.includes('to_regclass')?'READY':'1';}});
  await assert.rejects(createLocalTeacher(opts),/already exists/);
  assert.equal(calls.creates,0);assert.equal(calls.deletes,0);
});
test('local SQL failure deletes only newly created Auth user',async()=>{
  const [base,calls]=mocked();
  const original=base.db;
  base.db=(sql)=>{if(sql.includes('BEGIN;'))throw Error('Simulated local PostgreSQL failure');return original(sql);};
  await assert.rejects(createLocalTeacher(base),/Simulated/);
  assert.equal(calls.creates,1);assert.equal(calls.deletes,1);assert.equal(calls.logins,0);
});
test('rejects incomplete schema and invalid passwords before any user creation',async()=>{
  const [base,calls]=mocked({password:'short'});
  await assert.rejects(createLocalTeacher(base),/8–128/);
  await assert.rejects(createLocalTeacher({...base,password:'LocalTest9!',db:()=> 'NOT_READY'}),/schema absent/);
  assert.equal(calls.creates,0);
});
