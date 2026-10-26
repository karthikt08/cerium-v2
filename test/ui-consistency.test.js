import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const PUBLIC=fileURLToPath(new URL('../public/',import.meta.url));
const read=name=>readFileSync(join(PUBLIC,name),'utf8');
const pages=readdirSync(PUBLIC).filter(p=>p.endsWith('.html'));
const shared=read('css/ui-consistency.css');

test('every page uses one Cerium UI system before the final Figtree typography layer',()=>{
  assert.ok(pages.length>=17,'audit should include all customer-facing pages');
  for(const page of pages){
    const html=read(page),head=html.split('</head>')[0];
    const refs=[...head.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*href="([^"]+)"/g)].map(m=>m[1]);
    assert.equal(refs.filter(x=>x==='css/ui-consistency.css').length,1,page+' must load one shared UI layer');
    if(page==='app.html'){
      assert.equal(refs.at(-3),'css/ui-consistency.css',page+' retains shared controls before the dark skin');
      assert.equal(refs.at(-2),'css/workspace-pricing-dark.css',page+' installs the pricing skin only inside the software');
    }else assert.equal(refs.at(-2),'css/ui-consistency.css',page+' keeps shared controls just before typography');
    assert.equal(refs.at(-1),'css/typography.css',page+' must keep Figtree as the final cascade');
  }
});

test('shared controls retain action variants and compact icon / table sizes',()=>{
  for(const selector of ['.pg :is(a.btn,button.btn,a.gbtn,button.gbtn,a.button,button.button)',
    '.app-page .button:not(.icon-button)','.app-page .button.primary',
    '.app-page .button.secondary','.app-page .button.danger',
    '.app-page .table-actions .button','.app-page .table-actions .icon-button',
    '.app-page .button.sm','.onboarding-page :is(.verify-card button.primary',
    '.welcome-page .welcome-enter-btn']){
    assert.ok(shared.includes(selector),'missing shared variant: '+selector);
  }
  assert.match(shared,/--cerium-ui-radius:9px/);
  assert.match(shared,/\.app-page \.table-actions \.button\{[\s\S]*?min-height:29px/);
  assert.match(shared,/\.app-page \.button:disabled\{cursor:not-allowed/);
  assert.match(shared,/focus-visible/);
  assert.match(shared,/@media\(hover:none\)/);
  assert.match(shared,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(shared,/@media print/);
});

test('all native dialogs and the AI panel use the same surfaces, close controls and form fields',()=>{
  for(const cls of ['dialog.dialog','dialog.c-modal','dialog.jobs-dialog','dialog.quotes-dialog','dialog.workspace-config-dialog']){
    assert.ok(shared.includes(cls),'native dialog family missing '+cls);
  }
  for(const cls of ['.dialog-header .icon-button','.jobs-modal-header>button',
    '.quotes-dialog .quote-x','.workspace-config-dialog .ws-config-close',
    '.dialog-footer','.jobs-modal-actions','.quotes-modal-actions','.ws-config-footer',
    '.guide-panel','.guide-trigger','.guide-suggestions button','.guide-form input']){
    assert.ok(shared.includes(cls),'dialog or assistant control missing '+cls);
  }
  for(const attr of ['#record-dialog','#confirm-dialog','#invoice-dialog']){
    assert.ok(read('app.html').includes(attr.slice(1)),'template dialog absent: '+attr);
  }
  assert.match(read('js/jobs-page.js'),/d\.className='jobs-dialog'/);
  assert.match(read('js/quotes-page.js'),/d\.className='quotes-dialog'/);
  assert.match(read('js/workspace-customizer.js'),/class="workspace-config-dialog"/);
  assert.match(read('js/spreadsheet-import-ui.js'),/className='dialog lead-import-dialog'/);
  assert.match(shared,/background-color:#f7f9fc;color:#7b879b/,'read-only inputs stay visibly read-only');
  assert.match(shared,/border-color:#8399e8;outline:3px/,'dialog fields have visible keyboard focus');
  assert.match(shared,/\.app-page \.guide-trigger\{[\s\S]*?border-radius:10px/,'assistant trigger matches product controls');
  assert.match(read('app.html'),/src="js\/workspace-cursor\.js"/,'retain one product cursor');
});

test('all custom setup and dropdown controls use Figtree rather than independent system font stacks',()=>{
  const select=read('css/controls.css'),setup=read('css/business-setup.css'),type=read('css/typography.css');
  assert.doesNotMatch(select,/font:\s*(?:500\s+)?\d+px(?:\/\d+(?:\.\d+)?)?\s+system-ui/i);
  assert.doesNotMatch(setup,/font:\s*(?:(?:600)\s+)?\d+(?:\.\d+)?px(?:\/\d+(?:\.\d+)?)?\s+system-ui/i);
  assert.match(select,/--cerium-typeface/);
  assert.match(setup,/--cerium-typeface/);
  assert.match(type,/body, body \*, body \*::before, body \*::after/);
  assert.match(read('verify.html'),/class="onboarding-page"/);
  assert.match(read('welcome.html'),/class="welcome-page"/);
});

test('pricing FAQ reveal style and live public spatial effects remain valid',()=>{
  const pricing=read('pricing.html'),home=read('index.html'),benefits=read('benefits.html');
  assert.doesNotMatch(pricing,/class="pcard" style="padding:24px 28px" data-rv style=/);
  assert.equal((pricing.match(/class="pcard" data-rv style="padding:24px 28px;--i:/g)||[]).length,3);
  for(const page of [pricing,home,benefits]){
    assert.match(page,/href="css\/spatial\.css"/,'spatial glow should remain');
    assert.match(page,/src="js\/workspace-cursor\.js"/,'magnetic cursor should remain');
  }
  assert.match(pricing,/href="css\/pricing-motion\.css"/);
  assert.match(benefits,/class="pg home benefits-page"/);
  assert.match(benefits,/class="w hd"/,'spatial header should remain enabled');
});
