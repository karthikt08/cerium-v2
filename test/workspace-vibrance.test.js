import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const page=read('app.html');
const css=read('css/workspace-vibrance.css');

function luminance(hex){
  const rgb=hex.match(/[0-9a-f]{2}/gi).map(pair=>parseInt(pair,16)/255)
    .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
}
function contrast(a,b){
  const [hi,lo]=[luminance(a),luminance(b)].sort((x,y)=>y-x);
  return (hi+.05)/(lo+.05);
}

test('only workspace loads vibrant palette, after spatial effects and before shared controls/font',()=>{
  const styles=[...page.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(styles.slice(-4),[
    'css/workspace-spark.css','css/workspace-vibrance.css',
    'css/ui-consistency.css','css/typography.css'
  ]);
  assert.equal(styles.filter(x=>x==='css/workspace-vibrance.css').length,1);
  assert.match(page,/<body class="app-page">/);
  for(const filename of ['index.html','pricing.html','benefits.html','verify.html','terms.html']){
    assert.doesNotMatch(read(filename),/css\/workspace-vibrance\.css/,'marketing and onboarding stay unchanged: '+filename);
  }
});

test('workspace matches the landing blue violet pink palette at brighter saturation',()=>{
  const landing=read('css/home.css'),spatial=read('css/spatial.css');
  for(const color of ['#3b5bff','#7c3aed','#d946ef']){
    assert.ok(landing.includes(color),'landing source retains '+color);
    assert.ok(css.includes(color),'workspace uses signature color '+color);
  }
  assert.match(spatial,/rgba\(117,83,255,\.38\)/);
  assert.match(css,/rgba\(117,83,255,\.37\)/,'hero ambient is visibly closer to the landing');
  assert.match(css,/\.app-page \.main-frame\{/);
  assert.match(css,/\.app-page \.sidebar\{/);
  assert.match(css,/\.app-page \.overview-stage\{/);
  assert.match(css,/\.app-page \.overview-stage::before/);
  assert.match(css,/\.app-page \.overview-stage \.overview-title-accent/);
  assert.match(css,/\.app-page \.main-frame>\.topbar::after/);
});

test('primary actions retain high contrast while business status colors remain distinct',()=>{
  assert.ok(contrast('4934db','ffffff')>=4.5,'primary workspace accent must contrast with white text');
  assert.ok(contrast('3e2dc7','ffffff')>=4.5,'primary hover accent must contrast with white text');
  assert.ok(contrast('3f299a','dedaff')>=4.5,'active sidebar item must have readable contrast');
  assert.match(css,/--cerium-ui-primary:#4934db/);
  assert.match(css,/\.app-page :is\(\.main-frame,\.dialog,\.c-modal,\.jobs-dialog,\.quotes-dialog,\.workspace-config-dialog\) \.button\.primary:not\(:disabled\)/);
  assert.match(css,/\.app-page \.button\.secondary:hover:not\(:disabled\)/);
  assert.doesNotMatch(css,/\.button\.danger\{/,'do not recolor destructive actions');
  assert.doesNotMatch(css,/\.badge\.green\{|\.badge\.orange\{/,'keep semantic green/orange statuses');
  assert.match(css,/\.app-page \.metrics-grid \.metric\.warning \.metric-value\{color:#9b541b\}/);
});

test('dashboard and all core operational summary cards inherit vibrant treatment',()=>{
  for(const marker of [
    '.app-page .metrics-grid .metric',
    '.app-page .metrics-grid .metric::before',
    '.app-page .dashboard-grid>.panel',
    '.app-page .sidebar .nav-link[aria-current="page"]',
    '.app-page .marketing-tab.active',
    '.app-page .marketing-bar>span',
    '.quotes-summary>div',
    '.jobs-stats>.jobs-stat',
    '.board-column>.lead-card',
    '.reminders-stats>div',
    '.settings-grid .panel'
  ])assert.ok(css.includes(marker),'missing component: '+marker);
  assert.match(css,/\.app-page \.marketing-main\{/);
  assert.match(css,/\.app-page \.marketing-stat\{/);
  assert.match(css,/@media\(hover:hover\) and \(pointer:fine\)/);
});

test('workspace vibrance keeps print, motion and forms usable',()=>{
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/@media print\{/);
  assert.match(css,/background:#fff!important;box-shadow:none!important/,'print panels stay neutral');
  assert.doesNotMatch(css,/\.data-table\b|\.invoice-document\b|\.dialog::backdrop\b/,'no override to dense records, invoices or modal backdrops');
  const shared=read('css/ui-consistency.css');
  assert.match(shared,/\.app-page \.button\.danger\{/,'destructive treatment remains handled by common controls');
  assert.match(shared,/\.app-page \.button:disabled\{/,'disabled styling remains intact');
});
