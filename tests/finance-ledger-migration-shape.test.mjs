import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261016000300_finance_ledger_offline.sql',import.meta.url),'utf8');
test('finance draft models plan, unique dues, immutable entries, idempotency and integer minor currency',()=>{
  for(const name of ['fee_plans','monthly_dues','financial_operations','payments','payment_adjustments']) {
    assert.match(sql,new RegExp('create table public\\.'+name+' \\('));
    assert.match(sql,new RegExp('alter table public\\.'+name+' enable row level security'));
  }
  assert.match(sql,/unique \(student_id,batch_id,bill_period\)/);
  assert.match(sql,/operation_id uuid primary key/);
  assert.match(sql,/amount_minor bigint not null/g);
  assert.match(sql,/currency char\(3\) not null default 'BDT'/);
  assert.match(sql,/on delete restrict/);
});
test('finance draft has no end-user write permissions and no end-user idempotency policy',()=>{
  const statements=sql.split(';').map(x=>x.replace(/--[^\n]*/g,'').trim()).filter(Boolean);
  const forbidden=statements.filter(x=>/^create policy[\s\S]*?\bfor\s+(insert|update|delete|all)\b/i.test(x));
  assert.equal(forbidden.length,0);
  assert.equal(statements.some(x=>/^grant\s+(insert|update|delete|all)\b/i.test(x)),false);
  assert.equal(statements.some(x=>/^create policy\s+\w+\s+on\s+public\.financial_operations/i.test(x)),false);
});
