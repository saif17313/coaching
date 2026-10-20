import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {youtubeVideoId} from '../src/client/cms-video.mjs';
const site=readFileSync(new URL('../src/components/website/SiteExperience.tsx',import.meta.url),'utf8');
const player=readFileSync(new URL('../src/components/website/PublishedVideo.tsx',import.meta.url),'utf8');
const studio=readFileSync(new URL('../src/components/portal/WebsiteAdminStudio.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/app/globals.css',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/migrations/20261019000500_cms_verified_private_media.sql',import.meta.url),'utf8');
test('Part V accepts standard and privacy-domain YouTube links, not arbitrary hosts',()=>{
 for(const url of [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://youtube.com/watch?v=dQw4w9WgXcQ&t=1',
  'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://www.youtube.com/shorts/dQw4w9WgXcQ',
  'https://youtube.com/live/dQw4w9WgXcQ',
  'https://youtu.be/dQw4w9WgXcQ',
  'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
 ])assert.equal(youtubeVideoId(url),'dQw4w9WgXcQ',url);
});
test('Part V rejects credentialed, ported, forged, insecure and malformed YouTube URLs',()=>{
 for(const url of [null,undefined,123,'https://google.com/watch?v=dQw4w9WgXcQ',
  'http://youtu.be/dQw4w9WgXcQ','https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
  'https://www.youtube.com@evil.com/watch?v=dQw4w9WgXcQ',
  'https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ',
  'https://youtube.com:444/watch?v=dQw4w9WgXcQ',
  'https://youtube.com/watch?v=dQw4w9WgXcQ#unsafe',
  'https://youtube.com/watch?v=dQw4w9WgXcQ&v=dQw4w9WgXcQ',
  'https://youtube.com/watch?v=too-short',
  'https://youtu.be/dQw4w9WgXcQ/more',
  'https://youtube.com/embed/../watch?v=dQw4w9WgXcQ',
  'https://www.youtube-nocookie.com.evil.net/embed/dQw4w9WgXcQ',
 ])assert.equal(youtubeVideoId(url),null,String(url));
});
test('Part V video rendering consumes only recognized ID from existing published item URL',()=>{
 assert.match(site,/youtubeVideoId\(item\.url\)/);
 assert.match(site,/<PublishedVideo videoId=\{videoId\}/);
 assert.match(site,/case 'gallery'/);
 assert.match(site,/case 'news':case 'materials'/);
 assert.doesNotMatch(site,/<iframe|dangerouslySetInnerHTML|srcDoc/);
});
test('Part V client iframe is click to load and never interpolates user-provided raw URL',()=>{
 assert.match(player,/'use client'/);
 assert.match(player,/onClick=\{\(\)=>setActive\(true\)\}/);
 assert.match(player,/VIDEO_ID\.test\(videoId\)/);
 assert.match(player,/https:\/\/www\.youtube-nocookie\.com\/embed\/\$\{videoId\}/);
 assert.match(player,/referrerPolicy="strict-origin-when-cross-origin"/);
 assert.match(player,/sandbox="allow-scripts allow-same-origin allow-presentation"/);
 assert.doesNotMatch(player,/videoUrl|dangerouslySetInnerHTML|autoplay=1|youtube\.com\/embed/);
});
test('Part V CMS editor recognizes only safe shared video IDs and keeps same revision-gated item writer',()=>{
 assert.match(studio,/youtubeVideoId\(item\.url\)/);
 assert.match(readFileSync(new URL('../src/components/website/SitePresentation.tsx',import.meta.url),'utf8'),/youtubeVideoId\(item\.url\)/);
 assert.match(studio,/HTTPS link \/ YouTube video URL/);
 assert.match(studio,/cmsFetch\('item'/);
 assert.match(studio,/expectedRevision:page\.draftRevision/);
 assert.match(studio,/video file uploads are not part/);
});
test('Part V public video presentation is responsive and reduced motion, private CMS storage unchanged',()=>{
 assert.match(css,/musa-video-play:focus-visible/);
 assert.match(css,/\.musa-gallery-tile:has\(\.musa-video-preview\)/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(sql,/coaching_media_is_published_path/);
});
test('Part V published logo derives only a UUID and same-origin media route, no arbitrary image host',()=>{
 assert.match(site,/identity\?\.logoMediaId/);
 assert.match(site,/mediaFor\(logoId\)/);
 assert.match(site,/\/api\/v1\/public\/media\/\$\{mediaId\}/);
});
