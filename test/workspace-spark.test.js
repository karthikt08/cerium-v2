import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');

test('workspace adds landing-derived design only after module styles and before shared typography',()=>{
  const app=read('app.html'),styles=[...app.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(styles.filter(x=>x==='css/workspace-spark.css').length,1);
  assert.ok(styles.indexOf('css/guide-assistant.css')<styles.indexOf('css/workspace-spark.css'));
  assert.deepEqual(styles.slice(-8),['css/workspace-spark.css','css/workspace-vibrance.css','css/status-pricing-night.css','css/ui-consistency.css','css/workspace-overview-unified.css','css/workspace-blue-actions.css','css/workspace-midnight.css','css/typography.css']);
  assert.equal((app.match(/src="js\/workspace-cursor\.js"/g)||[]).length,1,'no extra cursor engine');
  assert.doesNotMatch(app,/css\/spatial\.css/,'avoid landing CSS overrides inside the application');
});

test('overview visual hero keeps dynamic business-local greeting and actionable navigation',()=>{
  const js=read('js/app.js');
  assert.match(js,/const greeting=`Good \$\{hour<12/,'maintain time-of-day greeting');
  assert.match(js,/const overviewHero=`<section class="overview-stage overview-stage-unified"/);
  assert.match(js,/\$\{esc\(day\)\}/,'local date stays escaped');
  assert.match(js,/overview-title-accent">\$\{esc\(first\)\}\.<\/span>/,'business-user name is escaped');
  assert.match(js,/\$\{addButton\('lead','New lead'\)\}/,'primary create-lead action remains');
  assert.match(js,/class="overview-shortcuts" aria-label="Quick workspace shortcuts"/);
  assert.match(js,/href="#jobs" data-nav="jobs"/);
  assert.match(js,/href="#invoices" data-nav="invoices"/);
  assert.match(js,/return overviewHero\+/,'single unified header precedes working panels');
  assert.match(js,/\$\{workspaceRow\}/,'customization row remains inside hero');
  assert.match(js,/\$\{indiaRow\}/,'India row remains inside hero');
  for(const value of ['Active leads','Follow-ups due','Outstanding','Overdue','metrics-grid','dashboard-grid'])
    assert.ok(js.includes(value),'keep existing dashboard data: '+value);
  assert.match(js,/if\(s==='overview'\)customizeOverview/,'customizable dashboard modules preserved');
});

test('ambient lighting and hero glow reuse existing cursor coordinates without introducing pointer handlers',()=>{
  const css=read('css/workspace-spark.css'),cursor=read('js/workspace-cursor.js');
  assert.match(css,/\.app-page \.overview-stage::before/);
  assert.match(css,/\.app-page \.overview-stage::after/,'hero has quiet spatial grid');
  assert.match(css,/--cursor-x,0/);
  assert.match(css,/--cursor-y,0/);
  assert.match(cursor,/root\.style\.setProperty\('--cursor-x'/);
  assert.match(cursor,/root\.style\.setProperty\('--cursor-y'/);
  assert.doesNotMatch(css,/cursor:\s*none/,'no new cursor hijacking');
  assert.match(css,/@keyframes workspace-accent-drift/,'landing-style dynamic title accent');
});

test('landing-inspired surfaces remain keyboard accessible and quiet during work',()=>{
  const css=read('css/workspace-spark.css');
  for(const token of [
    '.app-page .sidebar .nav-link[aria-current="page"]::before',
    '.app-page .metrics-grid .metric::before',
    '.app-page .metrics-grid .metric:focus-visible',
    '.app-page .dashboard-grid>.panel',
    '.app-page .main-frame>.topbar',
    '.app-page .overview-shortcut:focus-visible',
    '@media(hover:hover) and (pointer:fine)',
    '@media(hover:none)',
    '@media(prefers-reduced-motion:reduce)',
    '@media print']){
      assert.ok(css.includes(token),'missing visual or accessibility rule: '+token);
  }
  assert.doesNotMatch(css,/\.app-page\s+(?:dialog|\.dialog)\s*\{/,
    'do not attach spatial animations to sensitive editor dialogs');
  assert.doesNotMatch(css,/\.data-table\b|\.invoice-document\b/,
    'leave dense tables and invoices unchanged');
  assert.match(css,/\.overview-title-accent\{animation:none!important/,'reduce animation');
  assert.match(css,/\.overview-stage::before\{transform:none!important/,'reduce parallax');
});


test('unified dark Overview has legible copy and clearly distinguishable rules',()=>{
  const css=read('css/workspace-overview-unified.css');
  const luminance=hex=>{
    const rgb=hex.match(/[a-f\d]{2}/gi).map(n=>parseInt(n,16)/255)
      .map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);
    return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  };
  const ratio=(one,two)=>{
    const [light,dark]=[luminance(one),luminance(two)].sort((a,b)=>b-a);
    return (light+.05)/(dark+.05);
  };
  // Text colors are lightened against midnight surfaces, not darkened into invisibility.
  for(const [textColor,panelColor] of [
    ['#d4dcf4','#19243f'],['#e1e5f4','#19243f'],
    ['#d2dbef','#19243f'],['#d1dbee','#101319'],
  ])assert.ok(ratio(textColor,panelColor)>=4.5,textColor+' should remain readable on '+panelColor);
  assert.match(css,/border-top:1px solid rgba\(192,198,237,\.33\)/,'section dividers should be visible');
  assert.match(css,/border-top:1px solid rgba\(191,196,232,\.34\)/,'shortcut divider should be visible');
  assert.match(css,/border:1px solid rgba\(168,182,231,\.46\)/,'shortcut outlines should be visible');
  assert.match(css,/linear-gradient\(rgba\(167,182,235,\.18\)/,'spatial grid has discernible lines');
  for(const [textColor,surfaceColor] of [
    ['#52596e','#ffffff'],['#5d6578','#ffffff'],['#626b7e','#ffffff'],
  ])assert.ok(ratio(textColor,surfaceColor)>=4.5,'light cards should have readable ink');
  assert.match(css,/\.app-page \.metrics-grid \.metric\{border-color:#c7bfdc\}/);
  assert.match(css,/\.app-page \.dashboard-grid>\.panel\{border-color:#c9c6d8\}/);
  assert.doesNotMatch(css,/\.invoice-document|\.data-table/,'invoice printouts and dense tables are unchanged');
  assert.match(css,/@media print\{/,'print view preserved');
});
