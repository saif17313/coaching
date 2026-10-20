import test from 'node:test';
import assert from 'node:assert/strict';
import {CMS_FORMS} from '../src/client/cms-fields.mjs';
import {cmsFieldGroups} from '../src/client/cms-field-groups.mjs';
import {readFileSync} from 'node:fs';
test('every dedicated CMS editor exposes every persisted field exactly once',()=>{
 for(const form of Object.values(CMS_FORMS))for(const isItem of [false,true]){
  const source=form[isItem?'item':'section'];const keys=Object.keys(source.properties||{});
  const groups=cmsFieldGroups(form.key,source.properties,isItem);
  const actual=groups.flatMap(group=>group.keys);
  assert.deepEqual(new Set(actual),new Set(keys),`${form.key} ${isItem?'item':'section'}`);
  assert.equal(new Set(actual).size,actual.length,`duplicate fields: ${form.key}`);
  assert.ok(groups.every(g=>g.label.length&&g.keys.length));
 }
});
test('editor groups important sections without changing CMS data schema',()=>{
 const names=(key,item)=>cmsFieldGroups(key,CMS_FORMS[key][item?'item':'section'].properties,item).map(g=>g.label);
 assert.ok(names('HOME_HERO',false).includes('Educator and photograph'));
 assert.ok(names('CONTACT_INFO',false).includes('Map and directions'));
 assert.ok(names('REVIEWS_ITEMS',true).includes('Publication authorization'));
 assert.ok(names('GALLERY_ALBUMS',true).includes('Photos and videos'));
 assert.ok(names('NEWS_EVENTS_ITEMS',true).includes('Article content'));
 const component=readFileSync(new URL('../src/components/portal/StructuredCmsEditor.tsx',import.meta.url),'utf8');
 assert.match(component,/cmsFieldGroups\(key,schema\.properties,item\)/);
});
test('future field additions are available under Additional details',()=>{
 const data={teacherName:{},teacherImage:{},newField:{}};
 const groups=cmsFieldGroups('HOME_TEACHER',data,false);
 assert.deepEqual(groups.at(-1),{label:'Additional details',keys:['newField']});
});
