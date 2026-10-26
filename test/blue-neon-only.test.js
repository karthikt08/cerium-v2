import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../public/',import.meta.url));
const read=name=>readFileSync(join(root,name),'utf8');

function greenHue(r,g,b){
  const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
  if(!delta||max===0)return false;
  const hue=((max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4)*60+360)%360;
  return hue>=72&&hue<=174&&delta/max>.12;
}
function greenPaint(source){
  const found=[];
  for(const m of source.matchAll(/#([a-fA-F0-9]{6})(?![a-fA-F0-9])/g)){
    const n=parseInt(m[1],16);
    if(greenHue(n>>16&255,n>>8&255,n&255))found.push(m[0]);
  }
  for(const m of source.matchAll(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g)){
    if(greenHue(+m[1],+m[2],+m[3]))found.push(m[0]);
  }
  return [...new Set(found)];
}
test('the original light Cerium workspace remains unchanged',()=>{
  const html=read('app.html');
  const css=read('css/workspace-vibrance.css');
  const styles=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(x=>x[1]);
  assert.deepEqual(styles.slice(-4),[
    'css/workspace-spark.css','css/workspace-vibrance.css',
    'css/ui-consistency.css','css/typography.css'
  ]);
  assert.doesNotMatch(html,/workspace-pricing-dark\.css/,'never switch the full software into dark mode');
  assert.match(read('css/workspace.css'),/:root\{color-scheme:light;/);
  assert.match(css,/background:#f6f7fc/,'original workspace background is light');
  assert.match(css,/\.app-page \.sidebar\{/,'original sidebar remains');
  assert.match(css,/\.app-page \.metrics-grid \.metric\{/,'original cards remain');
  assert.match(html,/src="js\/workspace-card-motion\.js"/,'card animations remain');
  assert.match(read('index.html'),/\.en\{[^}]*background:#0c1729/,'homepage pricing section remains dark');
});

test('formerly green visual accents use the pricing-inspired electric blue family',()=>{
  const workspace=read('css/workspace.css');
  const jobs=read('css/jobs.css');
  const quotes=read('css/quotes.css');
  const guide=read('css/guide-assistant.css');
  const verify=read('css/verify-phone.css');
  const home=read('index.html');
  assert.match(workspace,/--green:#3b5bff/,'legacy variable now paints blue');
  assert.match(jobs,/\.job-tile\.green\{[^}]*#3b5bff/);
  assert.match(jobs,/\.job-status\.green\{[^}]*#1d3c93/);
  assert.match(quotes,/\.quote-accepted,\.quote-converted\{background:#e7efff;color:#2554bd/);
  assert.match(guide,/\.guide-status-dot\{[^}]*#3b5bff/);
  assert.match(verify,/\.setup-steps \[data-complete=true\]\{background:#e9efff/);
  assert.match(home,/\.c\.g\{[^}]*#1d3c93/);
  assert.match(read('css/workspace-vibrance.css'),/\.app-page \.plan-dot\{background:#3b5bff\}/);
});

test('no public CSS or HTML includes green-hued paint values',()=>{
  const files=[
    ...readdirSync(join(root,'css')).filter(x=>x.endsWith('.css')).map(x=>'css/'+x),
    ...readdirSync(root).filter(x=>x.endsWith('.html'))
  ];
  assert.ok(files.length>=40,'scan every public stylesheet and entry page');
  assert.deepEqual(files.flatMap(f=>greenPaint(read(f)).map(p=>f+' '+p)),[]);
});

test('only status paint changes, not status labels, workspace logic or printed documents',()=>{
  const app=read('js/app.js'),jobs=read('js/jobs-page.js');
  assert.match(app,/Done:'green',Paid:'green'/,'legacy classes can remain; their colors are blue');
  assert.match(jobs,/Completed:'green'/);
  assert.match(read('app.html'),/id="invoice-dialog"/);
  assert.doesNotMatch(read('css/workspace-vibrance.css'),/\.invoice-document\b/);
  assert.match(read('css/workspace-vibrance.css'),/@media print\{/);
});
