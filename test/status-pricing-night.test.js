import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const css=read('css/status-pricing-night.css');
const pages=['app.html','verify.html','welcome.html','index.html','pricing.html',
  'login.html','signup.html','forgot-password.html','reset-password.html','waitlist.html'];

test('pricing-night palette is loaded after page styles but does not darken page shells',()=>{
  for(const page of pages){
    const html=read(page);
    const links=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m=>m[1]);
    assert.equal(links.filter(x=>x==='css/status-pricing-night.css').length,1,page);
    assert.deepEqual(links.slice(-3),['css/status-pricing-night.css','css/ui-consistency.css','css/typography.css'],page);
  }
  assert.doesNotMatch(read('app.html'),/workspace-pricing-dark\.css/);
  assert.match(read('css/workspace-vibrance.css'),/background:#f6f7fc/,'workspace stays light');
  assert.match(read('index.html'),/\.en\{[^}]*background:#0c1729/,'pricing reference remains dark');
  assert.doesNotMatch(css,/\.app-page\s*\{\s*(?:background|color)/,'never darken the entire app');
  assert.doesNotMatch(css,/\.app-page \.main-frame\s*\{/, 'never change the workspace canvas');
  assert.doesNotMatch(css,/\.app-page \.sidebar\s*\{/,'sidebar unchanged');
  assert.doesNotMatch(css,/\.app-page \.metrics-grid/,'dashboard cards unchanged');
});

test('formerly green UI surfaces use the screenshot midnight-blue to charcoal/plum gradient',()=>{
  for(const token of ['#202b55','#151a27','#10131a','rgba(97,62,69,.51)','#f6f7ff','#46517c'])
    assert.ok(css.includes(token),'missing screenshot palette token: '+token);
  for(const token of ['.badge.green','.task-check.completed','.job-status.green','.job-tile.green',
    '.quote-accepted','.quote-converted','.guide-status-pill','.verified-business-country',
    '.wizard-progress [data-complete=true]','.setup-steps [data-complete=true]',
    '.mc.matched','.c.g','.msg.ok','.pcard-features li::before','.plan-dot','.welcome-badge-dot'])
    assert.ok(css.includes(token),'former green status lacks dark treatment: '+token);
  assert.match(css,/\.app-page \.job-tile\.green :is\(strong,\.job-tile-time,small\)/,
    'job labels must remain readable on midnight tiles');
  assert.match(css,/@media print\{/,'print statuses return to white');
  assert.match(css, /:focus-visible/,'keyboard focus stays visible');
  assert.match(read('app.html'),/src="js\/workspace-card-motion\.js"/,'motion intact');
});

test('previously green Google logo segment uses midnight ink, not electric blue',()=>{
  for(const p of ['login.html','signup.html']){
    const html=read(p);
    assert.match(html,/<path fill="#202b55" d="M24 48/);
    assert.doesNotMatch(html,/<path fill="#3b5bff" d="M24 48/);
  }
});
