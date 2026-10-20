/** Regenerates the immutable schema constant before first applying this migration. */
import {readFileSync} from 'node:fs';
import {CMS_FORMS} from '../src/client/cms-fields.mjs';
const path='supabase/migrations/20261020142746_typed_cms_reference_fields.sql';
const schemas=Object.fromEntries(Object.entries(CMS_FORMS).map(([key,s])=>[key,{section:s.section,item:s.item}]));
const template=readFileSync('supabase/verification/typed_cms_migration_template.sql','utf8');
if(!template.includes('__CMS_SCHEMAS__'))throw Error('Schema marker missing.');
if(readFileSync(path,'utf8')!==template.replace('__CMS_SCHEMAS__',JSON.stringify(schemas)))throw Error('Applied CMS schema differs from its reviewed template; create a new additive migration.');
console.log('Verified '+Object.keys(schemas).length+' schemas in '+path);
