import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startServer,signIn,ALICE} from './helpers.js';

const root=fileURLToPath(new URL('../public/',import.meta.url));
const read=(p)=>readFileSync(join(root,p),'utf8');

test('CERIUM entrance is locally served and cannot bypass workspace authentication',async()=>{
  const t=await startServer();
  try{
    const anonymous=t.browser();
    const loading=await anonymous.req('/enter.html?next=%2Fapp.html');
    assert.equal(loading.status,200);
    assert.match(await loading.text(),/data-cerium-entry="redirect"/);
    const protectedApp=await anonymous.req('/app.html');
    assert.equal(protectedApp.status,303);
    assert.match(protectedApp.headers.get('location'),/^\/login\.html\?returnTo=/);

    const member=t.browser();
    const signed=await signIn(t,member,{profile:ALICE});
    assert.equal(signed.cb.status,303);
    const redirect=new URL(signed.cb.headers.get('location'),t.base);
    assert.equal(redirect.pathname,'/enter.html');
    assert.equal(redirect.searchParams.get('next'),'/app.html');
    assert.equal((await member.me()).signedIn,true);
  }finally{await t.close();}
});

test('both sign-in methods and workspace entry use the same fast branded loader',()=>{
  const auth=read('js/auth-forms.js');
  const google=read('js/signin-page.js');
  const workspace=read('js/app.js');
  const shell=read('app.html');
  const entrance=read('enter.html');
  const loader=read('js/entry-loader.js');

  assert.match(auth,/\/enter\.html\?next=/);
  assert.match(google,/\/enter\.html\?next=/);
  assert.match(workspace,/CeriumEntryLoader\?\.complete\(\)/);
  assert.match(workspace,/CeriumEntryLoader\?\.fail\(\)/);
  assert.match(shell,/data-cerium-entry="workspace"/);
  assert.match(entrance,/data-cerium-entry="redirect"/);
  for(const page of [shell,entrance]){
    assert.match(page,/data-entry-skip/);
    assert.match(page,/data-asset="media\/cerium-entry\.mp4"/);
    assert.match(page,/entry-loader\.css/);
    assert.match(page,/entry-loader\.js/);
  }
  assert.match(loader,/prefers-reduced-motion/);
  assert.match(loader,/sessionStorage\.removeItem/);
  assert.match(loader,/\['\/app', '\/app\.html'\]/);
  assert.match(loader,/location\.replace\(next\)/);
  assert.doesNotMatch(loader,/eval\s*\(/);
});
