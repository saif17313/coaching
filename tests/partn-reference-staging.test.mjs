import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
test('CMS Studio replaces old monolithic editor; async initial reads have cancellation guard',()=>{
 const portal=read('src/components/portal/PortalClient.tsx');
 const studio=read('src/components/portal/WebsiteAdminStudio.tsx');
 assert.match(portal,/<WebsiteAdminStudio(?:\s|\/>)/);
 assert.doesNotMatch(portal,/function CmsEditor\(/);
 assert.match(studio,/Promise\.allSettled\(\[cmsFetch\('pages'\)/);
 assert.match(studio,/if\(!active\)return/);
 assert.match(studio,/active=false;selection\.current\+\+/);
 assert.doesNotMatch(studio,/useEffect\(\(\)=>\{reload\(\)\.catch/);
});
test('lint and TypeScript exclude only known historical payload staging, not app/tests',()=>{
 const eslint=read('eslint.config.mjs');
 const ts=JSON.parse(read('tsconfig.json'));
 assert.match(eslint,/\"payload\/\*\*\"/);
 assert.match(eslint,/\"installer\.cjs\"/);
 assert.doesNotMatch(eslint,/\"src\/\*\*\"/);
 assert(ts.exclude.includes('payload'));
 assert(!ts.exclude.includes('src'));
 assert(!ts.exclude.includes('tests'));
});
test('roadmap links exact reference parity source',()=>{
 assert.match(read('docs/BACKEND_MASTER_PLAN.md'),/SHIFATS_TALES_REFERENCE_PARITY_PARTN/);
 const parity=read('docs/SHIFATS_TALES_REFERENCE_PARITY_PARTN.md');
 assert.match(parity,/137 `page\.tsx` routes/);
 assert.match(parity,/No successful Part N install/);
});
