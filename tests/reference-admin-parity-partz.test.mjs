import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';import {WEBSITE_MENU,getWebsiteTarget} from '../src/client/reference-website-nav.mjs';
const code=readFileSync(new URL('../src/components/portal/PortalClient.tsx',import.meta.url),'utf8');const studio=readFileSync(new URL('../src/components/portal/WebsiteAdminStudio.tsx',import.meta.url),'utf8');const site=readFileSync(new URL('../src/components/website/ShifatAlignedSite.tsx',import.meta.url),'utf8');
test('Reference website menu has 13 grouped destinations and unique functional targets',()=>{assert.equal(WEBSITE_MENU.length,13);const rows=WEBSITE_MENU.flatMap(g=>g.items);assert.ok(rows.length>=45);assert.equal(new Set(rows.map(x=>x.id)).size,rows.length);for(const x of rows){const target=getWebsiteTarget(x.id);assert.equal(target.id,x.id);assert.equal(target.label,x.label);assert.match(x.id,/^[a-z0-9-]+$/);assert.ok(target.tab==='settings'||target.tab==='media'||target.slug);assert.ok(['full','partial'].includes(x.parity));}assert.equal(getWebsiteTarget('home-page-meet-teacher-section').slug,'home');assert.equal(getWebsiteTarget('home-page-meet-teacher-section').schemaKey,'HOME_TEACHER');});
test('Teacher and Website Admin use different sidebar trees while student tree is retained',()=>{assert.match(code,/isCms&&user.role==='teacher'\?<[a-z]+/);assert.match(code,/WEBSITE_MENU.map/);assert.match(code,/navigateWebsite\(target.id\)/);assert.match(code,/Teacher Portal/);assert.match(code,/StudentExperience/);});
test('Website section buttons route to actual secured CMS page and kind; missing fields are disclosed',()=>{assert.match(studio,/found=pages.find\(p=>p.slug===target.slug\)/);assert.match(studio,/choosePage\(found.id\)/);assert.match(studio,/page.sections.filter\(s=>s.kind===target.kind\)/);assert.match(studio,/no dedicated record/);assert.match(studio,/cmsFetch\('publish'/);assert.match(studio,/expectedRevision/);});
test('Hero never copies Shifat portrait or unverified image and uses original generated asset only as fallback',()=>{assert.match(site,/heroMedia\?/);assert.match(site,/musa-education-hero.png/);assert.doesNotMatch(site,/sir_photo_clean|Sifat Sir/);assert.ok(existsSync(new URL('../public/images/musa-education-hero.png',import.meta.url)));});

test('Part Z v1.1 sidebar navigation is React lint-safe and cancellable',()=>{
 const portal=readFileSync(new URL('../src/components/portal/PortalClient.tsx',import.meta.url),'utf8');
 const nav=studio.slice(studio.indexOf(' // React effects identify navigation targets;'),studio.indexOf(' const run=async('));
 assert.match(portal,/Shifat&amp;apos;|Shifat&amp;#39;|Shifat&apos;s Tales menu structure/);
 assert.equal((nav.match(/Promise\.resolve\(\)\.then\(\(\)=>/g)||[]).length,2);
 assert.equal((nav.match(/return\(\)=>\{active=false;\}/g)||[]).length,2);
 assert.match(nav,/handledTarget\.current===target\.requestId/);
 assert.match(nav,/setSelectedSection\(found\.id\)/);
});
