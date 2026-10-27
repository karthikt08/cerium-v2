import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');

for(const [page,title] of [['privacy.html','Privacy Policy'],['terms.html','Terms']]){
  test(page+' shows its full legal text even before scripts run',()=>{
    const html=read(page);
    assert.match(html,/class="lw"/,'legal document layout exists');
    assert.match(html,/<article class="doc">/,'document article is present');
    assert.doesNotMatch(html,/<article\b[^>]*\bdata-rv\b/,'the full-length article must never be gated behind intersection animations');
    assert.doesNotMatch(html,/<article\b[^>]*\bhidden\b/,'document must not be hidden');
    const article=html.match(/<article class="doc">([\s\S]*?)<\/article>/)?.[1];
    assert.ok(article,'legal article contains HTML text');
    assert.ok((article.match(/<h2 id="[^"]+">/g)||[]).length>=8,'all legal sections remain present');
    assert.ok((article.match(/<p(?:\s[^>]*)?>/g)||[]).length>=8,'legal policy paragraphs are visible in markup');
    assert.ok(article.includes('cerium.founders@gmail.com'),'legal contact stays accessible');

    const anchors=[...html.matchAll(/<a href="#([a-z-]+)">/g)].map(m=>m[1]);
    assert.ok(anchors.length>=8,'table of contents is present');
    for(const id of anchors)assert.ok(article.includes('id="'+id+'"'),id+' must link to an actual legal section');
    assert.match(html,/css\/spatial\.css/,'existing page styling remains');
    assert.match(html,/js\/home\.js/,'existing marketing interactions remain');
  });
}

test('privacy and terms never depend on the landing page reveal animation to display long documents',()=>{
  const styles=read('css/spatial.css'),js=read('js/home.js');
  assert.match(styles,/\.rv-on \[data-rv\]:not\(\.in\)\s*\{\s*opacity:0/);
  assert.match(js,/threshold:\.35/,'reveal threshold can hide full-screen-height documents');
  for(const page of ['privacy.html','terms.html']){
    assert.doesNotMatch(read(page),/<article\s+class="doc"\s+data-rv\s*>/);
  }
});
