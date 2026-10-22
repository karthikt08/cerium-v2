'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
test('every referenced local script, stylesheet and image exists',()=>{
 for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){
  const html=fs.readFileSync(path.join(root,file),'utf8').replace(/<!--[\s\S]*?-->/g,'');
  for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g)){
   const url=match[1];if(/^(https?:|mailto:|tel:|data:|#|\/\/)/.test(url))continue;
   const target=url.split(/[?#]/)[0];if(!target)continue;
   assert.ok(fs.existsSync(path.join(root,target)),file+': '+url);
  }
 }
});
test('all shipped JS parses as classic scripts for local file use',()=>{for(const f of fs.readdirSync(path.join(root,'js')).filter(f=>f.endsWith('.js')))assert.doesNotThrow(()=>new vm.Script(fs.readFileSync(path.join(root,'js',f),'utf8'),{filename:f}));});
test('workspace IDs are unique and every dialog action points to an existing dialog',()=>{
 const html=fs.readFileSync(path.join(root,'app.html'),'utf8');const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 for(const m of html.matchAll(/data-modal="([^"]+)"/g))assert.ok(ids.includes(m[1]),m[1]);
});
test('demo entry pages contain no credential collection or unimplemented forms',()=>{for(const file of ['login.html','signup.html','forgot-password.html','reset-password.html','waitlist.html']){const s=fs.readFileSync(path.join(root,file),'utf8');assert.doesNotMatch(s,/<form|type="password"/);assert.match(s,/Open demo workspace/);}});
