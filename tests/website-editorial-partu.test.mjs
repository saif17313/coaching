import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SECTION_PRESETS,sectionPreset,cmsEditorialAudit} from '../src/client/cms-section-presets.mjs';
const source=readFileSync(new URL('../src/components/website/SiteExperience.tsx',import.meta.url),'utf8');
const studio=readFileSync(new URL('../src/components/portal/WebsiteAdminStudio.tsx',import.meta.url),'utf8');
const style=readFileSync(new URL('../src/app/globals.css',import.meta.url),'utf8');
const homepage=readFileSync(new URL('../src/app/page.tsx',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261019000500_cms_verified_private_media.sql',import.meta.url),'utf8');
test('Part U editorial presets cover exact 15 reviewed CMS section kinds without new DTO claims',()=>{
 const kinds=['hero','rich-text','cards','gallery','results','courses','contact','cta','faq','news','reviews','academic-calendar','routine','materials','footer'];
 assert.deepEqual(SECTION_PRESETS.map(x=>x.kind).sort(),kinds.sort());
 assert.equal(new Set(SECTION_PRESETS.map(x=>x.kind)).size,15);
 for(const item of SECTION_PRESETS){assert.ok(item.label.length>2);assert.ok(item.heading.length>2);assert.ok(item.hint.length>20);assert.equal(sectionPreset(item.kind),item);}
 assert.equal(sectionPreset('iframe'),null);
});
test('Part U editorial checklist is advisory and does not add unpublished items',()=>{
 assert.deepEqual(cmsEditorialAudit(null),{checks:[],score:0});
 const page={seoTitle:'Musa Sir',seoDescription:'Personalised learning and student success',sections:[{kind:'cards',heading:'A section',visible:true,items:[{visible:true}]}]};
 const good=cmsEditorialAudit(page);assert.equal(good.score,4);assert.equal(good.checks.length,4);
 const hidden=cmsEditorialAudit({...page,sections:[{kind:'cards',heading:'',visible:false,items:[]}]});assert.equal(hidden.score,3);
 assert.equal(cmsEditorialAudit({...page,seoDescription:''}).score,3);
});
test('Part U hero sources headline, paragraph, link and image from CMS payload, never fixed CTA',()=>{
 assert.match(source,/section\.heading/);assert.match(source,/section\.body/);
 assert.match(source,/items\.find\(x=>x\.mediaId\)/);
 assert.match(source,/actions=items\.filter\(x=>external\(x\.url\)\)/);
 assert.doesNotMatch(source,/Explore our programs|Get in touch<\/a>/);
 assert.match(source,/mediaFor\(item\.mediaId\)/);
 assert.match(source,/unoptimized/);
});
test('Part U published section presentations remain type-specific and HTML-safe',()=>{
 for(const kind of ['hero','faq','reviews','gallery','cta','news','materials','academic-calendar','routine','results','footer'])assert.ok(source.includes(`case '${kind}'`),kind);
 assert.match(source,/rel="noopener noreferrer"/);
 assert.match(source,/startsWith\('https:\/\/'\)/);
 assert.doesNotMatch(source,/dangerouslySetInnerHTML|srcDoc|createElement\('script'\)|<iframe/);
 assert.match(source,/aria-label="Website navigation"/);
 assert.match(source,/prefers-reduced-motion:reduce|aria-hidden/);
});
test('Part U CMS blueprint inputs use existing section upsert contract and revision barrier',()=>{
 const workspace=readFileSync(new URL('../src/components/portal/CmsContextWorkspace.tsx',import.meta.url),'utf8');assert.match(workspace,/Object.values\(CMS_FORMS\)/);
 assert.match(workspace,/Section blueprint/);
 assert.match(studio,/expectedRevision:page\.draftRevision/);
 assert.match(studio,/cmsFetch\('section'/);
 assert.match(studio,/cmsFetch\('publish'/);
 assert.match(workspace,/Add section to draft/);
});
test('Part U CSS layouts are responsive, with motion fallback and private media contract unchanged',()=>{
 for(const cls of ['musa-gallery-grid','musa-review-grid','musa-editorial-row','musa-result-card','musa-cta-inner','musa-hero-photo'])assert.ok(style.includes(cls),cls);
 assert.match(style,/@media\(max-width:620px\)/);
 assert.match(style, /prefers-reduced-motion:reduce/);
 assert.match(migration,/private=false|false,5242880/);
 assert.match(migration,/media_assets/);
});

test('Part U published homepage SEO uses public snapshot metadata, not fixed markup',()=>{
 assert.match(homepage,/generateMetadata/);
 assert.match(homepage,/publicPage\('home'\)/);
 assert.match(homepage,/title:publicText\(page\.seoTitle\)/);
 assert.match(homepage,/description:publicText\(page\.seoDescription\)/);
 assert.match(homepage,/index:false/);
 assert.match(source,/musa-skip-link/);
});
