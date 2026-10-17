import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261016000500_teacher_settings_website_cms_offline.sql',import.meta.url),'utf8').toLowerCase();
const tables=['teacher_profiles','teacher_preferences','app_settings','media_assets','site_pages','site_page_sections','site_section_items'];
test('teacher settings and website CMS draft declares all seven Shifats Tales parity tables',()=>{
  for(const name of tables)assert.match(sql,new RegExp(`create table public\\.${name}\\s*\\(`));
  assert.match(sql,/site_pages_status_slug_idx/);assert.match(sql,/site_items_section_order_idx/);
});
test('all draft tables enable RLS and explicitly revoke anon/authenticated privileges',()=>{
  for(const name of tables)assert.match(sql,new RegExp(`alter table public\\.${name} enable row level security`));
  assert.match(sql,/revoke all on public\.teacher_profiles[\s\S]*public\.site_section_items from anon, authenticated/);
  assert.doesNotMatch(sql,/\bcreate policy\b/);
  assert.doesNotMatch(sql,/\bgrant\s+(?:select|insert|update|delete|all)\b/);
});
test('CMS retains publication snapshot, revision, draft/public split and secure media metadata',()=>{
  assert.match(sql,/published_snapshot jsonb/);assert.match(sql,/published_revision bigint/);
  assert.match(sql,/draft_content jsonb/);assert.match(sql,/published_content jsonb/);
  assert.match(sql,/sha256 text not null/);assert.match(sql,/content_type text not null/);
  assert.match(sql,/site_section_items \(/);assert.match(sql,/references public\.media_assets\(id\)/);
});
