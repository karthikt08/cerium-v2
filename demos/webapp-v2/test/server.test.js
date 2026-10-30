'use strict';
const {test,before,after} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createServer} = require('../server.js');
let server,port;
before(async()=>{server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));port=server.address().port;});
after(()=>new Promise(resolve=>server.close(resolve)));
function request(path,method='GET') {return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port,path,method},res=>{let body='';res.on('data',d=>body+=d);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});r.on('error',reject);r.end();});}
test('serves main page and clean html route',async()=>{for(const path of ['/','/app','/app.html?demo=1']){const r=await request(path);assert.equal(r.status,200);assert.match(r.body,/<!doctype html>/i);}});
test('HEAD provides metadata and no body',async()=>{const r=await request('/app.html','HEAD');assert.equal(r.status,200);assert.equal(r.body,'');assert.ok(Number(r.headers['content-length'])>0);});
test('malformed percent encoding responds 400 without crashing server',async()=>{assert.equal((await request('/%E0%A4%A')).status,400);assert.equal((await request('/app.html')).status,200);});
test('traversal, encoded traversal, dotfiles and null paths are rejected',async()=>{for(const p of ['/../package.json','/%2e%2e/package.json','/.git/config','/js/../server.js','/app.html%00'])assert.equal((await request(p)).status,403,p);});
test('server and tests are not public web assets',async()=>{for(const p of ['/server.js','/package.json','/test/api.test.js','/README.md'])assert.equal((await request(p)).status,404,p);});
test('only GET and HEAD are allowed',async()=>{const r=await request('/app.html','POST');assert.equal(r.status,405);assert.equal(r.headers.allow,'GET, HEAD');});
test('assets have correct MIME types and security headers',async()=>{const r=await request('/js/api.js');assert.equal(r.status,200);assert.match(r.headers['content-type'],/javascript/);assert.equal(r.headers['x-content-type-options'],'nosniff');assert.equal((await request('/css/refinements.css')).status,200);assert.equal((await request('/favicon.svg')).status,200);});
test('unknown routes and directories produce 404',async()=>{for(const p of ['/missing','/css/','/api/me'])assert.equal((await request(p)).status,404);});

test('Windows filename casing does not block a valid static page', {skip:process.platform!=='win32'}, async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cerium-demo-case-'));
  const doc=path.join(root,'MixedCase.html');
  fs.writeFileSync(doc,'<!doctype html><title>Case test</title>');
  // CI diagnostics for the Windows case-alias behavior.
  const base=fs.realpathSync(root),requestTarget=path.resolve(base,'.\\\\mixedcase.html');
  const physical=fs.realpathSync(path.join(base,'mixedcase.html'));
  console.log('CASE_DIAGNOSTIC',JSON.stringify({root,base,requestTarget,physical,requested:path.relative(base,requestTarget),resolved:path.relative(base,physical),relativeTarget:path.relative(requestTarget,physical),leafSymlink:fs.lstatSync(path.join(base,'mixedcase.html')).isSymbolicLink()}));
  const srv=createServer(root);
  try {
    await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));
    const response=await new Promise((resolve,reject)=>{
      const req=http.get({host:'127.0.0.1',port:srv.address().port,path:'/mixedcase.html'},res=>{
        let body='';res.on('data',data=>body+=data);res.on('end',()=>resolve({status:res.statusCode,body}));
      });
      req.on('error',reject);
    });
    assert.equal(response.status,200);
    assert.match(response.body,/Case test/);
  } finally {
    if(srv.listening)await new Promise(resolve=>srv.close(resolve));
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('local symlink aliases are still forbidden', {skip:process.platform==='win32'}, async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cerium-demo-symlink-'));
  fs.writeFileSync(path.join(root,'real.html'),'<!doctype html><title>Real</title>');
  fs.symlinkSync('real.html',path.join(root,'alias.html'));
  const srv=createServer(root);
  try {
    await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));
    const response=await new Promise((resolve,reject)=>{
      const req=http.get({host:'127.0.0.1',port:srv.address().port,path:'/alias.html'},res=>{
        res.resume();res.on('end',()=>resolve(res.statusCode));
      });
      req.on('error',reject);
    });
    assert.equal(response,403);
  } finally {
    if(srv.listening)await new Promise(resolve=>srv.close(resolve));
    fs.rmSync(root,{recursive:true,force:true});
  }
});
