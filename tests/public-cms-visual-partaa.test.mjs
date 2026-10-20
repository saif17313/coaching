import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Part AA homepage hero uses independently published media or local cinematic fallback',()=>{
 const x=read('src/components/website/SitePresentation.tsx');
 assert.match(x,/heroMedia\?'tale-uses-published-hero':'tale-uses-local-hero'/);
 assert.match(x,/const heroMedia=visibleItems\(hero\)\.find/);
 assert.match(x,/tale-visual-published/);
});
test('Part AA public visual shell keeps published CMS and no direct table writes',()=>{
 const x=read('src/server/website/public-site.ts');
 assert.match(x,/cache:'no-store'/);
 assert.match(x,/coaching_cms_get_published_page/);
 assert.doesNotMatch(x,/coaching_cms_write/);
 const css=read('src/components/website/shifat-aligned.css');
 assert.match(css,/\.tale-home-hero\.tale-uses-local-hero/);
 assert.match(css,/\.tale-uses-published-hero/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
test('Part AA carousel uses verified uploaded image first, then decorative course artworks',()=>{
 const x=read('src/components/website/ReferenceCourseCarousel.tsx');
 assert.match(x,/item\.mediaId&&MEDIA_ID\.test\(item\.mediaId\)/);
 assert.match(x,/musa-course-art-\$\{\(index%4\)\+1\}\.webp/);
 for(let i=1;i<=4;i++)assert.equal(existsSync(new URL(`../public/images/musa-course-art-${i}.webp`,import.meta.url)),true);
});
test('Part AA read-only check has no POST/PATCH/mutation gate',()=>{
 const p=read('RUN_MUSA_PUBLIC_CMS_READONLY_AUDIT.ps1');
 assert.match(p,/Invoke-RestMethod/);
 assert.doesNotMatch(p,/-Method\s+(POST|PATCH|PUT|DELETE)/i);
 assert.doesNotMatch(p,/COACHING_ENABLE_MUTATION_APIS/);
});
