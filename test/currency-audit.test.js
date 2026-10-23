import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(new URL('../package.json',import.meta.url)));
function sourceFiles(dir){
  return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(entry=>{
    const rel=path.join(dir,entry.name);
    if(entry.isDirectory())return sourceFiles(rel);
    return /\.(html|js|css|json|txt|xml)$/.test(entry.name)?[rel]:[];
  });
}
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

// Archives in demos/ intentionally retain old reference implementations.
// Only public/ is deployed by the Express static-file server. The original
// historical currency must not be mislabeled or rewritten automatically.
test('live CERIUM assets contain no hard-coded rupee symbols or INR currency selectors',()=>{
  const files=sourceFiles('public');
  for(const file of files){
    const source=read(file);
    if(!['public/js/app.js','public/js/billing.js'].includes(file))
      assert.equal(source.includes(String.fromCharCode(0x20b9)),false,
        file+' unexpectedly contains a rupee glyph outside the India edition pricing UI');
    if(file.endsWith('.html')){
      assert.doesNotMatch(source,/value\s*=\s*["']INR["']/i,
        file+' contains an INR selector visible to customers');
      assert.doesNotMatch(source,/US and India/i,
        file+' contains old two-country marketing');
    }
  }
  assert.ok(files.length>20,'must scan the complete shipped frontend');
});

test('dollar defaults, legacy safeguards and active backend write barrier stay enforced',()=>{
  const db=read('server/db.js');
  const app=read('server/app.js');
  const conf=read('server/config.js');
  const quotes=read('server/quotes.js');
  const model=read('public/js/workspace-model.js');
  assert.match(db,/currency\s+TEXT DEFAULT 'USD'/);
  assert.match(conf,/if\(currency!=='USD'\)/);
  assert.match(app,/currency_review_required/);
  assert.match(db,/NOT EXISTS \(SELECT 1 FROM quotes/);
  assert.match(db,/NOT EXISTS \(SELECT 1 FROM invoices/);
  assert.match(db,/NOT EXISTS \(SELECT 1 FROM payments/);
  assert.match(app,/country==='IN'&&user.currency==='INR'/);
  assert.match(model,/currency = 'USD'/);
  assert.match(quotes,/currency_changed/);
});
