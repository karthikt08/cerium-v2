import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root=fileURLToPath(new URL('../public/',import.meta.url));
const pages=readdirSync(root).filter(name=>name.endsWith('.html'));
const read=file=>readFileSync(join(root,file),'utf8');
const shared=read('css/typography.css');

test('all CERIUM HTML pages load the same Figtree font and last-in-cascade typography stylesheet',()=>{
  assert.ok(pages.length>=16,'Test must cover every public HTML page.');
  for(const page of pages){
    const html=read(page),head=html.split('</head>')[0].replace(/href="\/css\//g,'href="css/');
    const rule='<link rel="stylesheet" href="css/typography.css">';
    assert.equal(head.split(rule).length-1,1,page+' should load shared typography exactly once');
    const stylesheetLinks=[...head.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/g)].map(x=>x[0]);
    assert.equal(stylesheetLinks.at(-1),rule,page+' should load typography after page styles');
    assert.match(head,/https:\/\/fonts\.googleapis\.com\/css2\?family=Figtree:wght@400;500;600;700;800&display=swap/,page);
    assert.doesNotMatch(head,/family=(?:Instrument\+Sans|Bricolage\+Grotesque)/,page+' still downloads another typeface');
  }
});

test('typography consistently covers body, pop-ups, forms, headings and generated controls',()=>{
  assert.match(shared,/--cerium-typeface:\s*"Figtree"/);
  assert.match(shared,/body, body \*, body \*::before, body \*::after/);
  assert.match(shared,/font-family:\s*var\(--cerium-typeface\)\s*!important/);
  assert.match(shared,/\.entry-name/);
  assert.match(shared,/font-family:\s*"Cerium Entrance"/);
  assert.ok(pages.includes('app.html')&&pages.includes('verify.html'));
  assert.ok(pages.includes('enter.html')&&pages.includes('welcome.html'));
  assert.ok(pages.includes('index.html'));
});
