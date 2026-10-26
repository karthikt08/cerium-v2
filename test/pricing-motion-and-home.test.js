import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');

test('pricing page cards inherit Cerium spatial scroll reveal and subtle hover animations',()=>{
  const page=read('pricing.html'),css=read('css/pricing-motion.css');
  assert.match(page,/href="css\/pricing-motion\.css"/,'dedicated motion styles are loaded');
  assert.match(page,/src="js\/home\.js"/,'existing intersection observer drives all reveals');
  assert.match(page,/src="js\/workspace-cursor\.js"/,'keep existing cursor engine');
  assert.equal((page.match(/<div data-rv style="--i:[0-4]"><strong>/g)||[]).length,5,'all country tiers reveal on scroll');
  assert.match(page,/class="pcard" data-rv style="--i:0"/);
  assert.match(page,/class="pcard featured" data-rv style="--i:1"/);
  assert.match(css,/\.pg\.home \.pricing-grid \.pcard:hover/,'offer cards lift on hover');
  assert.match(css,/\.pg\.home \.country-price-tiers > div:hover/,'country tier cards lift on hover');
  assert.match(css,/@keyframes cerium-pricing-enter/,'staggered entrances are defined');
  assert.match(css,/animation-delay:calc\(var\(--i,0\)\*\.095s\)/,'entrance is staggered rather than simultaneous');
  assert.match(css,/animation:cerium-pricing-enter/,'reveal animation has actual trigger');
  assert.match(css,/from\{opacity:0;translate:0 25px\}/,'translate is separate from hover transforms');
  const reveal=css.match(/@keyframes cerium-pricing-enter\{[\s\S]*?\n\}/)?.[0]||'';
  assert.ok(reveal,'entrance keyframes must be present');
  assert.doesNotMatch(reveal,/transform:/,'reveal must not lock CSS hover transform');
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/,'disabled for reduced-motion preferences');
  assert.match(css,/@media print/,'cards remain visible in print');
});

test('home pricing displays 11-for-12 annual option with regional prices, not founding discount',()=>{
  const home=read('index.html'),pricing=read('pricing.html'),regional=read('js/region-pricing.js');
  assert.match(home,/<b data-region-price>\$20<\/b><span>per month<\/span>/);
  assert.match(home,/<strong data-region-annual-price>\$220<\/strong>\/year · one month free/);
  assert.match(home,/<strong data-region-annual-savings>\$20<\/strong>/);
  for(const value of ['$20 / $16 / $12 / $8','₹500/month','11 monthly payments for 12 months'])
    assert.ok(home.includes(value),'home retains regional annual facts '+value);
  assert.match(home,/href="pricing\.html">See full pricing and availability/);
  assert.match(home,/where annual checkout is available/,'annual billing is availability-gated');
  assert.match(pricing,/save one month/,'pricing landing matches homepage');
  assert.match(pricing,/data-region-annual-price>\$220/);
  assert.match(regional,/plan\.monthlyPrice\*11/,'yearly prices are derived from selected country');
  assert.match(regional,/data-region-annual-savings/,'home annual savings track selected country');
  assert.doesNotMatch(home,/50% off for life|founding 20|2 months free/i,'unlaunched promotions must not be advertised');
});
