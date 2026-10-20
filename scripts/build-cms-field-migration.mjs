/** Verify the latest additive schema migration without rewriting applied history. */
import {readFileSync} from 'node:fs';
import {CMS_FORMS} from '../src/client/cms-fields.mjs';
const path='supabase/migrations/20261020164645_portfolio_reference_fields.sql';
const schemas=Object.fromEntries(Object.entries(CMS_FORMS).map(([key,s])=>[key,{section:s.section,item:s.item}]));
const stored=readFileSync(path,'utf8').match(/\$schemas\$([\s\S]*?)\$schemas\$/)?.[1];
if(stored!==JSON.stringify(schemas))throw Error('Applied CMS schema differs from its reviewed migration; create a new additive migration.');
console.log('Verified '+Object.keys(schemas).length+' schemas in '+path);
