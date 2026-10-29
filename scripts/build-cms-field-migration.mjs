/** Verify the applied CMS schema (2026-10-22 base plus later additive overlays) matches the client forms. */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {CMS_FORMS} from '../src/client/cms-fields.mjs';
export function appliedCmsSchemas(){
 const base=JSON.parse(readFileSync('supabase/migrations/20261022154412_editable_website_interface.sql','utf8').match(/\$schemas\$([\s\S]*?)\$schemas\$/)[1]);
 const overlay=readFileSync('supabase/migrations/20261029214755_guardian_review_fields.sql','utf8');
 const fields=[...overlay.matchAll(/\$fields\$([\s\S]*?)\$fields\$/g)].map(match=>JSON.parse(match[1]));
 Object.assign(base.REVIEWS_ITEMS.item.properties,fields[0]);Object.assign(base.HOME_TESTIMONIALS.section.properties,fields[1]);
 return base;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const expected=Object.fromEntries(Object.entries(CMS_FORMS).map(([key,s])=>[key,{section:s.section,item:s.item}]));
 const sort=value=>Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])])):value;
 if(JSON.stringify(sort(appliedCmsSchemas()))!==JSON.stringify(sort(expected)))throw Error('Applied CMS schema differs from the client forms; create a new additive migration.');
 console.log('Verified '+Object.keys(expected).length+' schemas');
}
