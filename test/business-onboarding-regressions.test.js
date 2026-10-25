import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateBusinessProfile} from '../public/js/business-profile.js';
import {businessDetails} from './business-fixtures.js';

const requiredText=['name','businessName','trade','businessAddress','businessCity'];
test('required business text cannot be satisfied by invisible characters alone',()=>{
  for(const field of requiredText)for(const value of ['\u200b','\u200c\u200d',' \u2060\uFE0F ', '\u00ad']){
    assert.throws(()=>validateBusinessProfile({...businessDetails('US'),[field]:value},'US'),
      err=>Boolean(err.fields?.[field]),field+' must contain visible text');
  }
});
test('business names and addresses retain international characters and legitimate joiners',()=>{
  for(const value of ['தமிழ் சேவைகள்','محمد احمد','हिन्दी व्यवसाय','می\u200cروم','山田商店','José García']){
    const profile=validateBusinessProfile({...businessDetails('US'),name:value,businessName:value},'US');
    assert.equal(profile.name,value);assert.equal(profile.businessName,value);
  }
});
test('explicitly invalid currency choices are rejected instead of silently defaulted',()=>{
  for(const value of ['',false,0,null,[],{},'INVALID']){
    assert.throws(()=>validateBusinessProfile({...businessDetails('GB'),invoiceCurrency:value},'GB'),
      err=>Boolean(err.fields?.invoiceCurrency),JSON.stringify(value));
  }
  assert.equal(validateBusinessProfile(businessDetails('US'),'US').invoiceCurrency,'USD');
});
