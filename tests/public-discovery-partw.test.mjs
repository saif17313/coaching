import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPublishedDirectory,searchPublishedDirectory} from '../src/client/public-discovery.mjs';
const x='4a79bf2e-6405-4c24-8c01-dbeff13b6c55',y='25f9ad03-3b3e-430e-9f1a-068065793ca4';
const sections=[{id:x,kind:'hero',heading:'Welcome',body:'Explore our coaching',items:[{title:'Join class',description:'We care about students',url:'https://example.com/private',mediaId:'abc'}]},{id:y,kind:'courses',heading:'Courses',body:'Learn new skills',items:[{title:'Physics',description:'Mechanics and optics'}]}];
test('Part W builds only a minimal index without media keys, links or arbitrary fields',()=>{
 const d=buildPublishedDirectory(sections);assert.equal(d.length,2);assert.equal(d[1].label,'Courses');
 const json=JSON.stringify(d);assert.doesNotMatch(json,/mediaId|example\.com|private|abc/);
});
test('Part W searches published section headings and item text (case-insensitive)',()=>{
 const d=buildPublishedDirectory(sections);assert.equal(searchPublishedDirectory(d,'PHYSICS')[0].title,'Physics');assert.equal(searchPublishedDirectory(d,'optics')[0].id,y);assert.equal(searchPublishedDirectory(d,'coaching')[0].id,x);
});
test('Part W ignores invalid identifiers, explicit invisible sections/items and footer',()=>{
 const d=buildPublishedDirectory([...sections,{id:'unsafe\" onclick=\"alert(1)',kind:'news',heading:'X'},{id:x,kind:'news',heading:'Duplicate'},{id:'f35c693a-e6be-4c71-96ef-1a182ea7aedd',kind:'footer',heading:'Footer'},{id:'f95c693a-e6be-4c71-96ef-1a182ea7aedd',kind:'news',heading:'Secret',visible:false}]);
 assert.deepEqual(d.map(i=>i.label),['Welcome','Courses']);
});
test('Part W bounds result count, oversized source and short/untrusted queries',()=>{
 const many=Array.from({length:65},(_,i)=>({...sections[0],id:crypto.randomUUID()}));
 assert.deepEqual(buildPublishedDirectory(many),[]);const d=buildPublishedDirectory(sections);
 assert.deepEqual(searchPublishedDirectory(d,'a'),[]);assert.deepEqual(searchPublishedDirectory(d,'x'.repeat(121)),[]);assert.deepEqual(searchPublishedDirectory(d,null),[]);
});
test('Part W discovery browser component never loads third-party search or private CMS data',()=>{
 const component=readFileSync(new URL('../src/components/website/SiteDiscovery.tsx',import.meta.url),'utf8');
 const site=readFileSync(new URL('../src/components/website/SiteExperience.tsx',import.meta.url),'utf8');
 assert.match(component,/'use client'/);assert.match(component,/type="search"/);assert.match(component,/aria-live="polite"/);assert.match(component,/href=\{`#section-\$\{entry.id\}`\}/);assert.doesNotMatch(component,/fetch\(|dangerouslySetInnerHTML|localStorage|document\./);
 assert.match(site,/buildPublishedDirectory\(sections\)/);assert.match(site,/<SiteDiscovery entries=\{publishedIndex\}/);assert.match(site,/public media|section-\$\{section.id\}/); 
});
test('Part W public stylesheet supports mobile, keyboard and reduced motion',()=>{
 const css=readFileSync(new URL('../src/app/globals.css',import.meta.url),'utf8');
 assert.match(css,/musa-discover-search/);assert.match(css,/musa-discover-links a:focus-visible/);assert.match(css,/@media\(max-width:700px\)/);assert.match(css,/prefers-reduced-motion:reduce/);
});
