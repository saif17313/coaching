import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const sql=readFileSync(fileURLToPath(new URL('../supabase/migrations/20261016000200_learning_resources_offline.sql',import.meta.url)),'utf8');
test('resources migration models parity tables and enables RLS on each',()=>{
  for(const table of ['batch_contents','announcements','notification_dispatches','notifications','audit_logs']){
    assert.match(sql,new RegExp(`create table public\\.${table} \\(`,'i'));
    assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security;`,'i'));
  }
  assert.match(sql,/notifications_owner_read/);
  assert.match(sql,/batch_contents_student_published_read/);
  assert.match(sql,/announcements_student_published_read/);
  assert.match(sql,/constraint notification_unique_delivery unique \(event_id,recipient_id\)/);
});
test('resources migration deliberately does not expose client write grants or policies',()=>{
  assert.doesNotMatch(sql,/grant\s+(insert|update|delete|all)\s+on\s+public\./i);
  assert.doesNotMatch(sql,/create\s+policy\s+\w+\s+on\s+public\.(batch_contents|announcements|notifications)\s+for\s+(insert|update|delete)/i);
  assert.match(sql,/revoke all on public\.batch_contents/);
});
