import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderMarketingPage,MARKETING_FEATURE_TABS} from '../public/js/marketing-page.js';
import {marketingFeatureFromHash} from '../public/js/marketing-features.js';
import {trustedGuideLink} from '../public/js/guide-links.js';

const css=fs.readFileSync(new URL('../public/css/marketing.css',import.meta.url),'utf8');
const workspace=fs.readFileSync(new URL('../public/css/workspace-vibrance.css',import.meta.url),'utf8');
const shared=fs.readFileSync(new URL('../public/css/ui-consistency.css',import.meta.url),'utf8');
const html=renderMarketingPage({account:{businessName:'Sample',timeZone:'UTC'},leads:[],reviews:[],invoices:[],followUps:[]});

test('Marketing uses Cerium workspace tokens instead of a separate purple system',()=>{
  for(const token of [
    '--cerium-ui-ink','--cerium-ui-muted','--cerium-ui-border',
    '--cerium-ui-subtle','--cerium-ui-primary','--cerium-ui-focus',
    '--cerium-ui-radius','--cerium-vibrant-gradient'
  ])assert.ok(css.includes('var('+token),token);
  assert.match(workspace,/--cerium-vibrant-gradient/);
  assert.match(shared,/--cerium-ui-radius:9px/);
  assert.match(css,/\.marketing-page-heading h1\{/);
  assert.match(css,/\.marketing-main\{[^}]*border:1px solid/);
  assert.match(html,/class="page-heading marketing-page-heading"/);
  assert.match(html,/class="panel marketing-main"/);
  assert.match(html,/class="panel-header marketing-feature-header"/);
  assert.match(html,/class="panel-body marketing-feature-body"/);
  assert.match(html,/class="marketing-fields form-grid"/);
  assert.match(html,/class="field marketing-message-label"/);
  assert.doesNotMatch(css,/background:#7452c7/,'Use the shared Cerium action color, not standalone Marketing violet');
});

test('Marketing adopts the same primary and secondary button components as the app',()=>{
  assert.ok(html.includes('class="button primary marketing-primary-button"'));
  assert.ok(html.includes('class="button secondary marketing-light-button"'));
  assert.ok(css.includes('var(--marketing-accent)'));
  assert.ok(css.includes('var(--marketing-border)'));
  assert.ok(css.includes('var(--cerium-ui-primary-hover'));
  assert.ok(html.includes('data-marketing-copy'));
  assert.ok(html.includes('data-marketing-generate'));
});

test('Browser-style scalable top tabs retain the large shared workspace and deep links',()=>{
  assert.ok(html.indexOf('class="marketing-switcher"')<html.indexOf('class="panel marketing-main"'));
  assert.match(css,/\.marketing-switcher\{[^}]*overflow-x:auto/);
  assert.match(css,/\.marketing-tab::before/);
  assert.match(css,/clip-path:polygon/);
  assert.match(css,/\.marketing-tab\.active::after/);
  assert.match(css,/\.marketing-main\{[^}]*min-height:/);
  assert.match(css,/@media\(max-width:680px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  for(const {key,label} of MARKETING_FEATURE_TABS){
    assert.ok(html.includes(label));
    assert.ok(html.includes('id="marketing-panel-'+key+'"'));
    assert.equal(marketingFeatureFromHash('#marketing/'+key),key);
    assert.ok(trustedGuideLink('#marketing/'+key));
  }
});

test('Brand adaptation does not remove real marketing tools or human approval',()=>{
  for(const control of [
    'data-marketing-draft','data-marketing-copy','data-marketing-generate',
    'data-marketing-followup','marketing-customer-list','marketing-insight-grid'
  ]){
    if(control==='data-marketing-followup')continue; // Rendered only when an eligible customer exists.
    assert.ok(html.includes(control),control);
  }
  assert.match(html,/No messages are sent automatically/);
  assert.match(html,/Human review required/);
  assert.match(html,/What we do not measure yet/);
});
