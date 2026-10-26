import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');

test('workspace adds landing-derived design only after module styles and before shared typography',()=>{
  const app=read('app.html'),styles=[...app.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(styles.filter(x=>x==='css/workspace-spark.css').length,1);
  assert.ok(styles.indexOf('css/guide-assistant.css')<styles.indexOf('css/workspace-spark.css'));
  assert.deepEqual(styles.slice(-5),['css/workspace-spark.css','css/workspace-vibrance.css','css/status-pricing-night.css','css/ui-consistency.css','css/typography.css']);
  assert.equal((app.match(/src="js\/workspace-cursor\.js"/g)||[]).length,1,'no extra cursor engine');
  assert.doesNotMatch(app,/css\/spatial\.css/,'avoid landing CSS overrides inside the application');
});

test('overview visual hero keeps dynamic business-local greeting and actionable navigation',()=>{
  const js=read('js/app.js');
  assert.match(js,/const greeting=`Good \$\{hour<12/,'maintain time-of-day greeting');
  assert.match(js,/const overviewHero=`<section class="overview-stage"/);
  assert.match(js,/\$\{esc\(day\)\}/,'local date stays escaped');
  assert.match(js,/overview-title-accent">\$\{esc\(first\)\}\.<\/span>/,'business-user name is escaped');
  assert.match(js,/\$\{addButton\('lead','New lead'\)\}/,'primary create-lead action remains');
  assert.match(js,/class="overview-shortcuts" aria-label="Quick workspace shortcuts"/);
  assert.match(js,/href="#jobs" data-nav="jobs"/);
  assert.match(js,/href="#invoices" data-nav="invoices"/);
  assert.match(js,/return overviewHero\+industryNote/,'keep business customization and notices');
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
