import test from 'node:test';
import assert from 'node:assert/strict';
import {validOrganization} from '../src/client/cms-order.mjs';
const id='11111111-1111-4111-8111-111111111111',item='22222222-2222-4222-8222-222222222222';
test('deletion requires an exact section/card target and revision with no order payload',()=>{const command={action:'item.delete',sectionId:id,itemId:item,orderIds:null,expectedRevision:4};assert.equal(validOrganization(command),true);for(const patch of [{sectionId:null},{itemId:null},{orderIds:[id]},{expectedRevision:0},{extra:true}])assert.equal(validOrganization({...command,...patch}),false);assert.equal(validOrganization({...command,action:'section.delete',itemId:null}),true);assert.equal(validOrganization({...command,action:'section.delete'}),false);});
