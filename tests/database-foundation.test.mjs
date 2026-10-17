import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20261016000100_phase1_core_foundation.sql', import.meta.url), 'utf8');

test('phase 1 core tables and constraints exist', () => {
  for (const table of ['profiles', 'batches', 'enrollments'])
    assert.match(sql, new RegExp(`create table public\\.${table} \\(`, 'i'));
  for (const constraint of ['batch_dates_valid', 'batch_capacity_valid', 'enrollments_student_batch_unique', 'enrollments_decision_consistent'])
    assert.match(sql, new RegExp(constraint));
});

test('all tables have RLS and authenticated read policies', () => {
  for (const table of ['profiles', 'batches', 'enrollments']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(sql, new RegExp(`on public\\.${table} for select to authenticated`, 'i'));
  }
});

test('signup role never comes from user metadata', () => {
  assert.match(sql, /values \(new\.id, 'student'::public\.app_role, ''\)/);
  assert.doesNotMatch(sql, /raw_user_meta_data|raw_app_meta_data/i);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]* on public\.profiles to authenticated/i);
});

test('enrollment mutations remain closed until service layer', () => {
  assert.doesNotMatch(sql, /create policy \w+ on public\.enrollments for (insert|update|delete)/i);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]* on public\.enrollments to authenticated/i);
});

test('security definer functions use controlled search paths', () => {
  const funcs = [...sql.matchAll(/create function public\.(\w+)\(\)[\s\S]*?\$\$;/gi)];
  assert.equal(funcs.length, 2);
  for (const [, name] of funcs) {
    const declaration = sql.match(new RegExp(`create function public\\.${name}\\(\\)[\\s\\S]*?\\$\\$;`, 'i'))[0];
    assert.match(declaration, /security definer/i);
    assert.match(declaration, /set search_path = ''/i);
  }
});
