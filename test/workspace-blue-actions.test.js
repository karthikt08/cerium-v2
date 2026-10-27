import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const css=read('css/workspace-blue-actions.css');
const html=read('app.html');

const luminance=hex=>{
  const linear=hex.match(/[a-f\d]{2}/gi).map(v=>parseInt(v,16)/255)
    .map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
  return linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
};
const ratio=(a,b)=>{
  const [hi,lo]=[luminance(a),luminance(b)].sort((a,b)=>b-a);
  return (hi+.05)/(lo+.05);
};

test('blue is loaded only on workspace after other button treatments',()=>{
  const links=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(links.filter(x=>x==='css/workspace-blue-actions.css').length,1);
  assert.ok(links.indexOf('css/workspace-overview-unified.css')<links.indexOf('css/workspace-blue-actions.css'));
  assert.ok(links.indexOf('css/workspace-blue-actions.css')<links.indexOf('css/typography.css'));
  for(const file of ['index.html','benefits.html','pricing.html','verify.html','welcome.html']){
    assert.doesNotMatch(read(file),/workspace-blue-actions\.css/,file+' should not be restyled');
  }
});

test('selected blue CTAs have clear accessible white-on-blue contrast',()=>{
  assert.ok(ratio('ffffff','315cca')>=4.5,'default blue button text');
  assert.ok(ratio('ffffff','244eb4')>=4.5,'blue button hover text');
  assert.match(css,/--cerium-action-blue:#315cca/);
  assert.match(css,/--cerium-action-blue-hover:#244eb4/);
  for(const name of ['.page-heading .heading-actions','.settings-actions','.quote-action-group',
    '.dialog .dialog-footer','.jobs-dialog .jobs-modal-actions',
    '.quotes-dialog .quotes-modal-actions','.overview-india-actions']){
    assert.ok(css.includes(name),'missing intentional blue CTA destination: '+name);
  }
  assert.match(css,/\.button\.primary:focus-visible/,'visible keyboard focus ring');
  assert.match(css,/@media \(forced-colors:active\)/,'system high-contrast mode supported');
});

test('blue treatment does not repaint secondary, destructive, or unrelated navigation',()=>{
  assert.doesNotMatch(css,/\.button\.secondary\s*\{|\.button\.danger\s*\{|\.sidebar\s*\{|\.nav-link\s*\{/);
  assert.doesNotMatch(css,/\.invoice-document|\.data-table|\.metric\s*\{/);
  assert.match(html,/class="button danger" type="submit">Delete/,'delete action stays semantic red');
  assert.match(html,/class="button secondary" type="button" data-action="close-dialog">Cancel/);
});
