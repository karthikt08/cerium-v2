import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const css=read('css/workspace-title-glow.css');
const base=read('css/workspace-navigation.css');
const page=read('app.html');
const typography=read('css/typography.css');

test('workspace themes load shared neon and isolate their navigation styles',()=>{
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
  assert.match(css, /d='M12 12C64 6 120 16 179 9S257 12 288 10'/);
  assert.match(css, /:is\(\.page-heading,\.workspace-feature-content\) \.ac > svg\.ul \{\s*display:none!important/);
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

test('both neon underline endpoints have actual filled circular caps in the SVG mask',()=>{
  // Chromium can render stroke-linecap=round as flat for an SVG used as a
  // CSS mask. Paint explicit circles so both animated ends remain round.
  const mask=css.match(/--cerium-title-neon-mask:url\("data:image\/svg\+xml,([^"]+)"\)/)?.[1];
  assert.ok(mask,'shared neon underline mask exists');
  const svg=decodeURIComponent(mask);
  assert.match(svg, /stroke-width='7'/,'preserve the shared stroke thickness');
  assert.match(svg, /vector-effect='non-scaling-stroke'/);
  assert.match(svg, /stroke-linecap='round'/);
  assert.match(svg, /d='M12 12C64 6 120 16 179 9S257 12 288 10'/);
  assert.match(svg, /<circle cx='12' cy='12' r='3\.5' fill='white'\/>/,'left cap is a filled circle');
  assert.match(svg, /<circle cx='288' cy='10' r='3\.5' fill='white'\/>/,'right cap is a filled circle');
  assert.match(css, /-webkit-mask-size:100% 100%/);
  assert.match(css, /mask-size:100% 100%/);
  assert.match(css, /animation:cerium-title-neon-flow 5s ease-in-out infinite alternate!important/);
});

test('every core feature page and direct subview receives neon titles with a visible text-to-line gap',()=>{
  const app=read('js/app.js');
  const files=[
    'js/app.js','js/jobs-page.js','js/quotes-page.js','js/reminders-page.js',
    'js/marketing-page.js','js/payment-dues-page.js','js/migration-page.js',
    'js/workspace-insights.js','js/workspace-view-panels.js'
  ];
  for(const file of files){
    assert.ok(read(file).includes('page-heading'),'page-heading expected for '+file);
  }
  assert.match(app, /function decorateHeadingAccents\(root\)/);
  assert.match(app, /querySelectorAll\('\.page-heading h1:not\(:has\(\.overview-title-accent\)\), \.workspace-feature-content > h1/);
  assert.match(app, /decorateHeadingAccents\(\$\('page-body'\)\)/);
  assert.match(css, /--cerium-title-neon-gap:14px/);
  assert.match(css, /padding-bottom:var\(--cerium-title-neon-gap\)!important/);
  assert.match(css, /bottom:-11px/);
  for(const selector of [
    '.page-heading h1:not(:has(.ac)):not(:has(.overview-title-accent))',
    '.page-heading .ac',
    '.workspace-feature-content > h1:not(:has(.ac))',
    '.workspace-feature-content > h1 .ac',
    '.marketing-feature-header .panel-title h2',
    '.overview-stage-unified .overview-title-accent'
  ]){
    assert.ok(css.includes(selector),'shared neon heading missing '+selector);
  }
  assert.match(css, /\.workspace-feature-content > h1 \.ac::after/,'custom subview underline');
  assert.match(css, /\.overview-stage-unified \.overview-title-accent::after/,'Overview underline');
});


test('all public primary heading accents load identical animated rounded neon underlines',()=>{
  const publicPages=[
    'index.html','benefits.html','pricing.html','about.html','contact.html',
    'faq.html','terms.html','privacy.html','login.html','signup.html',
    'waitlist.html','verify.html'
  ];
  for(const pageName of publicPages){
    const html=read(pageName);
    assert.ok(html.includes('typography.css'),'title theme stylesheet missing on '+pageName);
    assert.ok(html.includes('class="ac"')||html.includes('wd ac"'),'accent title absent on '+pageName);
    assert.ok(html.includes('class="ul"'),'original title SVG unexpectedly removed on '+pageName);
  }

  const publicStyle=css.slice(css.indexOf('/* Public-page hero accents'));
  assert.ok(publicStyle.startsWith('/* Public-page hero accents'));
  assert.match(publicStyle, /:is\(\.pg,\.onboarding-page\)/,'public and onboarding host selectors');
  assert.match(publicStyle, /:is\(\.pg :is\(h1,h2\),\.onboarding-page h1\) \.ac/);
  assert.match(publicStyle, /-webkit-mask-image:var\(--cerium-title-neon-mask\)/);
  assert.match(publicStyle, /mask-image:var\(--cerium-title-neon-mask\)/);
  assert.match(publicStyle, /bottom:-11px;/,'consistent text-to-line gap');
  assert.match(publicStyle, /--cerium-title-neon-gap:14px;/);
  assert.match(publicStyle, /stroke-width='7'/,'same line thickness as workspace');
  const masks=[...css.matchAll(/--cerium-title-neon-mask:url\("data:image\/svg\+xml,([^"]+)"\)/g)]
    .map(match=>decodeURIComponent(match[1]));
  assert.equal(masks.length,2,'one rounded SVG mask for workspace and one for public pages');
  assert.equal(masks[0],masks[1],'workspace and public pages render identical cap geometry');
  for(const cap of ["<circle cx='12' cy='12' r='3.5' fill='white'/>",
    "<circle cx='288' cy='10' r='3.5' fill='white'/>"]){
    assert.ok(masks[0].includes(cap),'shared SVG mask missing '+cap);
  }
  assert.match(publicStyle, /animation:cerium-title-neon-flow 5s ease-in-out infinite alternate!important/);
  assert.match(publicStyle, /:not\(\.wd\)/,'landing word-entry animation is not overridden');
  assert.match(publicStyle, /\.pg h1 \.ac-wrap::after/,'Benefits sibling underline uses wrapper');
  assert.match(publicStyle, /\.pg h1 \.ac-wrap > \.ac::after \{content:none!important;display:none!important;\}/);
  assert.match(publicStyle, /@media screen and \(prefers-reduced-motion:reduce\)/);
  assert.match(publicStyle, /@media screen and \(forced-colors:active\)/);
  assert.doesNotMatch(publicStyle, /\.pg \.panel h2|\.pg \.cd h3|\.invoice-document/,
    'do not add neon to every business card or invoice heading');
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
