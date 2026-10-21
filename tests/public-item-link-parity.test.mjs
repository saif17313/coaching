import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicItemLink} from '../src/client/public-item-links.mjs';
const id='a872a707-bd9b-42ee-b1d0-ab99dd34bcee';
test('gallery and news deep links navigate to implemented routes and a visible item anchor',()=>{
 assert.equal(publicItemLink('gallery',id),'/site/gallery#item-'+id);
 assert.equal(publicItemLink('news',id),'/site/news-events#item-'+id);
 const site=readFileSync(new URL('../src/components/website/SitePresentation.tsx',import.meta.url),'utf8');
 assert.match(site,/id=\{`item-\$\{item\.id\.toLowerCase\(\)\}`\}/);
 assert.match(site,/href=\{publicItemLink\(kind,item\.id\)!\}/);
 assert.doesNotMatch(site,/\/site\/\$\{kind===.*\}\/\$\{item\.id\}/);
});
test('foreign kinds, malformed identifiers and script fragments never create destinations',()=>{
 for(const x of ['../../secret','not-a-uuid','"><script>',''])assert.equal(publicItemLink('gallery',x),null);
 assert.equal(publicItemLink('reviews',id),null);
 assert.equal(publicItemLink('news',42),null);
});
test('Website Admin maps open draft sections while preserving public fallback for other sources',()=>{
 const map=readFileSync(new URL('../src/components/portal/HomepageSectionMap.tsx',import.meta.url),'utf8');
 assert.match(map,/draft\?:SitePage\|null/);
 assert.match(map,/homeSectionMap\(related\.home,related\)/);
 assert.match(map,/editing draft/);
 const studio=readFileSync(new URL('../src/components/portal/WebsiteAdminStudio.tsx',import.meta.url),'utf8');
 assert.match(studio,/<CmsContextWorkspace[\s\S]*?preview=\{previewPage\}/);const workspace=readFileSync(new URL('../src/components/portal/CmsContextWorkspace.tsx',import.meta.url),'utf8');assert.match(workspace,/homeSectionMap/);assert.match(workspace,/CmsLivePreview draft=\{p.preview\}/);
});
test('Student admission fee selector uses real BDT formatting, not placeholder characters',()=>{
 const source=readFileSync(new URL('../src/components/portal/StudentAdmissionProfile.tsx',import.meta.url),'utf8');
 assert.match(source,/charge\.billPeriod\} · ৳/);
 assert.doesNotMatch(source,/charge\.billPeriod\} \? \?/);
});
