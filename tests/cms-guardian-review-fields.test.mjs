import test from 'node:test';
import assert from 'node:assert/strict';
import {CMS_FORMS,validateCmsFields} from '../src/client/cms-fields.mjs';
import {appliedCmsSchemas} from '../scripts/build-cms-field-migration.mjs';
const sort=value=>Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])])):value;
test('applied database CMS schemas (base + guardian overlay) equal the client forms exactly',()=>{
 const applied=appliedCmsSchemas();
 for(const [key,form] of Object.entries(CMS_FORMS))assert.deepEqual(sort({section:applied[key].section,item:applied[key].item}),sort({section:form.section,item:form.item}),key);
});
test('guardian review fields are optional, typed and bounded',()=>{
 assert.ok(validateCmsFields('REVIEWS_ITEMS',{author:'DEMO Guardian',relationship:'Mother',studentContext:'Class 9',reviewDate:'2026-10-01',rating:5,approved:true,consent:true},true));
 assert.ok(validateCmsFields('REVIEWS_ITEMS',{author:'Existing review without new fields'},true));
 assert.equal(validateCmsFields('REVIEWS_ITEMS',{relationship:'Uncle'},true),false);
 assert.equal(validateCmsFields('REVIEWS_ITEMS',{reviewDate:'01/10/2026'},true),false);
 assert.ok(validateCmsFields('HOME_TESTIMONIALS',{selectedTestimonialIds:[],autoplaySeconds:6}));
 assert.equal(validateCmsFields('HOME_TESTIMONIALS',{autoplaySeconds:1}),false);
});
