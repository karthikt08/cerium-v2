import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const page=read('app.html');
const css=read('css/workspace-vibrance.css');
const marketingCss=read('css/marketing.css');

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
  assert.deepEqual(styles.slice(-7),[
    'css/workspace-spark.css','css/workspace-vibrance.css',
    'css/status-pricing-night.css','css/ui-consistency.css',
    'css/workspace-overview-unified.css','css/workspace-blue-actions.css','css/typography.css'
  ]);
  assert.equal(styles.filter(x=>x==='css/workspace-vibrance.css').length,1);
  assert.match(page,/<body class="app-page">/);
  for(const filename of ['index.html','pricing.html','benefits.html','verify.html','terms.html']){
    assert.doesNotMatch(read(filename),/css\/workspace-vibrance\.css/,'marketing and onboarding stay unchanged: '+filename);
  }
});

test('workspace retains landing accents with restrained glow and neutral surfaces',()=>{
  const landing=read('css/home.css'),spatial=read('css/spatial.css');
  for(const color of ['#3b5bff','#7c3aed','#d946ef']){
    assert.ok(landing.includes(color),'landing source retains '+color);
    assert.ok(css.includes(color),'workspace uses signature color '+color);
  }
  assert.match(spatial,/rgba\(117,83,255,\.38\)/);
  assert.match(css,/rgba\(117,83,255,\.21\)/,'hero has a perceptible but contained glow');
  assert.doesNotMatch(css,/rgba\(117,83,255,\.37\)/,'no overbright ambient glow');
  assert.match(css,/rgba\(113,90,215,\.12\)/,'workspace background remains quiet');
  assert.match(css,/background:linear-gradient\(135deg,#fff 43%,#f8f5ff 100%\)/,'KPI cards keep a white-majority, lilac-tinted surface');
  assert.match(css,/background:linear-gradient\(139deg,#fff 52%,#faf8ff 100%\)/,'operational cards remain primarily white');
  assert.match(css,/opacity:\.66;transform:scaleX\(\.8\)/,'KPI accents remain visible even before hover');
  assert.doesNotMatch(css,/rgba\(113,90,215,\.23\)/,'keep out the previous full-strength workspace glow');
  assert.match(css,/\.app-page \.main-frame\{/);
  assert.match(css,/\.app-page \.sidebar\{/);
  assert.match(css,/\.app-page \.overview-stage\{/);
  assert.match(css,/\.app-page \.overview-stage::before/);
  assert.match(css,/\.app-page \.overview-stage \.overview-title-accent/);
  assert.match(css,/\.app-page \.main-frame>\.topbar::after/);
});

test('primary actions retain high contrast while business status colors remain distinct',()=>{
  assert.ok(contrast('5542c8','ffffff')>=4.5,'primary workspace accent must contrast with white text');
  assert.ok(contrast('4534ae','ffffff')>=4.5,'primary hover accent must contrast with white text');
  assert.ok(contrast('44318d','e6e3fb')>=4.5,'active sidebar item must have readable contrast');
  assert.match(css,/--cerium-ui-primary:#5542c8/);
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
    '.quotes-summary>div',
    '.jobs-stats>.jobs-stat',
    '.board-column>.lead-card',
    '.reminders-stats>div',
    '.settings-grid .panel'
  ])assert.ok(css.includes(marker),'missing component: '+marker);
  assert.match(marketingCss,/\.marketing-tab\.active\{/);
  assert.match(marketingCss,/\.marketing-bar>span\{/);
  assert.match(marketingCss,/\.marketing-main\{/);
  assert.match(marketingCss,/\.marketing-stat\{/);
  assert.doesNotMatch(css,/\.app-page \.marketing-tab\.active/,'Marketing controls its own palette instead of conflicting with workspace styles');
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
