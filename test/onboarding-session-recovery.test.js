import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getMe} from '../public/js/api.js';

test('strict onboarding session checks distinguish outages from a signed-out account',async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async()=>{throw new Error('Connection lost');};
    await assert.rejects(getMe({strict:true}),/Connection lost/);
    assert.deepEqual(await getMe(),{signedIn:false},'existing callers keep their fallback');
    globalThis.fetch=async()=>new Response('Unavailable',{status:503});
    await assert.rejects(getMe({strict:true}),/account|connection/i);
    globalThis.fetch=async()=>Response.json({signedIn:false});
    assert.deepEqual(await getMe({strict:true}),{signedIn:false});
    globalThis.fetch=async()=>Response.json({signedIn:true,csrfToken:'test-token',user:{id:'owner'}});
    assert.equal((await getMe({strict:true})).signedIn,true);
  }finally{globalThis.fetch=original;}
});
