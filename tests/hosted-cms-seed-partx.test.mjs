import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {plan,parseEnv,safeConfig,TARGET,checkDemo} from '../scripts/seed-hosted-cms.mjs';
const raw=JSON.parse(readFileSync(new URL('../data/cms-demo.json',import.meta.url),'utf8'));
test('reference-aligned public page inventory and demo safety',()=>{
 const p=plan();assert.equal(p.pages,12);assert.equal(p.sections,29);assert.equal(p.items,47);
 assert.deepEqual(p.slugs,['home','about','courses','gallery','results','reviews','news-events','materials','academic-calendar','class-routine','projects','contact']);
 assert.match(raw.settings.tagline,/DEMO/);
 assert.ok(raw.pages.every(p=>p.sections.length>0));
 assert.ok(raw.pages.flatMap(p=>p.sections).flatMap(s=>s.items).every(i=>i.url===null));
});
test('no silent schema drift or duplicate page slugs',()=>{
 const d=structuredClone(raw);d.pages[1].slug=d.pages[0].slug;assert.throws(()=>checkDemo(d),/duplicate/);
 const x=structuredClone(raw);x.settings.logoMediaId='fake';assert.throws(()=>checkDemo(x),/disclaimer/);
});
test('dotenv parsing never trusts process overrides and fails closed on wrong project',()=>{
 const env=parseEnv(`SUPABASE_URL=https://${TARGET}.supabase.co\nSUPABASE_ANON_KEY='sb_publishable_fake'\n`);
 assert.equal(safeConfig(env).base,`https://${TARGET}.supabase.co`);
 assert.throws(()=>safeConfig({...env,SUPABASE_URL:'https://other.supabase.co'}),/mismatch/);
 assert.throws(()=>safeConfig({...env,SUPABASE_ANON_KEY:'foo bar'}),/invalid/);
});
test('website visual uses CSS dimensional scene and honors reduced motion',()=>{
 const site=readFileSync(new URL('../src/components/website/SiteExperience.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/app/globals.css',import.meta.url),'utf8');
 const orbit=readFileSync(new URL('../src/components/website/SiteOrbital.tsx',import.meta.url),'utf8');
 assert.match(site,/SiteOrbital brand=\{brand\}/);
 assert.match(orbit,/aria-hidden="true"/);
 assert.match(css,/perspective:960px/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(orbit,/fetch\(|iframe|canvas/);
});
