import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const css=read('css/workspace-title-glow.css');
const base=read('css/workspace-navigation.css');
const page=read('app.html');
const typography=read('css/typography.css');

test('all workspace pages load the shared neon heading theme without public page changes',()=>{
  assert.ok(typography.startsWith('@import url("./workspace-reference-theme.css");'));
  for(const file of ['workspace-outlines.css','workspace-title-glow.css']){
    assert.ok(typography.includes('@import url("./'+file+'");'));
  }
  assert.ok(typography.indexOf('workspace-title-glow.css')>typography.indexOf('workspace-outlines.css'));
  assert.ok(page.includes('<link rel="stylesheet" href="css/typography.css">'));
  assert.doesNotMatch(page, /<link rel="stylesheet" href="css\/workspace-title-glow\.css">/);
  assert.match(css, /@media screen/);
  assert.match(css, /\.app-page #page-body \.page-heading/);
  assert.doesNotMatch(css, /\.pg\.home|\.sidebar|\.invoice-document/);
});

test('Job schedule and every workspace page use the same thick non-scaling curved underline',()=>{
  assert.match(read('js/jobs-page.js'), /Job schedule<svg class="ul"/);
  assert.match(read('js/app.js'), /const brandHeadingSVG = '<svg class="ul"/);
  assert.ok(base.includes('h1:not(:has(.ac)):not(:has(.overview-title-accent))'));
  assert.match(css, /--cerium-page-title-stroke:7px;/);
  assert.match(css, /viewBox='0 0 300 20'/);
  assert.match(css, /stroke-width='7'/);
  assert.match(css, /vector-effect='non-scaling-stroke'/);
  assert.match(css, /d='M5 12C58 6 120 16 179 9S266 12 295 10'/);
  assert.match(css, /\.page-heading \.ac > svg\.ul \{\s*display:none!important/);
  const underlines=css.slice(css.indexOf('/* ONE shape/weight'));
  for(const selector of [
    '.page-heading h1:not(:has(.ac)):not(:has(.overview-title-accent))::after',
    '.page-heading .ac::after',
    '.marketing-feature-header .panel-title h2::after',
    '.overview-stage-unified .overview-title-accent::after'
  ])assert.ok(underlines.includes(selector),'missing shared underline '+selector);
  assert.match(underlines, /height:20px;/);
  assert.match(underlines, /mask-image:var\(--cerium-title-neon-mask\)/);
  assert.match(underlines, /-webkit-mask-image:var\(--cerium-title-neon-mask\)/);
  assert.match(underlines, /mask-size:100% 100%/);
});

test('neon text and underline have visibly moving blue-violet-magenta colors',()=>{
  for(const c of ['#3b5bff','#7c3aed','#d946ef']){
    assert.ok(css.includes(c),'missing landing neon color '+c);
  }
  assert.match(css, /--cerium-title-neon-gradient:linear-gradient/);
  assert.match(css, /background-image:var\(--cerium-title-neon-gradient\)!important/);
  assert.match(css, /background-size:220% 100%!important/);
  assert.match(css, /animation:cerium-title-neon-flow 5s ease-in-out infinite alternate!important/);
  assert.match(css, /@keyframes cerium-title-neon-flow/);
  assert.match(css, /filter:drop-shadow\(0 0 6px rgba\(59,91,255,\.45\)\)/);
  assert.match(css, /drop-shadow\(0 0 15px rgba\(124,58,237,\.56\)\)/);
  assert.match(css, /drop-shadow\(0 0 24px rgba\(217,70,239,\.32\)\)!important/);
  assert.match(css, /filter:none!important;/,'masked underline should receive glow via its parent, not lose it to clipping');
  assert.match(css, /-webkit-background-clip:text!important/);
  assert.match(css, /-webkit-text-fill-color:transparent!important/);
  assert.match(css, /Overview/);
});

test('animation remains accessible and keeps printed business documents neutral',()=>{
  assert.match(css, /@media screen and \(prefers-reduced-motion:reduce\)/);
  assert.match(css, /animation:none!important/);
  assert.match(css, /@media screen and \(forced-colors:active\)/);
  assert.match(css, /-webkit-text-fill-color:CanvasText!important/);
  assert.match(css, /background:Highlight!important/);
  assert.doesNotMatch(css, /@media print[\s\S]*color-scheme:dark/);
  assert.doesNotMatch(css, /\.app-page \.workspace-angular-navigation|\.cerium-dialog-tier-tab/,'Design D navigation not changed');
});
