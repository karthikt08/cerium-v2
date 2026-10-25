import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {ROOT,TERMS_VERSION} from '../server/config.js';

const read=name=>fs.readFileSync(path.join(ROOT,'public',name),'utf8');
const pages=['index.html','benefits.html','pricing.html','about.html','contact.html','signup.html','login.html','terms.html','privacy.html'];

test('homepage has six concise benefit cards and a visible full benefits link',()=>{
  const html=read('index.html');
  const section=html.split('<section class="sc" id="benefits">')[1]?.split('</section>')[0];
  assert.ok(section,'benefits section must exist');
  assert.equal((section.match(/<article class="cd"/g)||[]).length,6);
  assert.match(section,/<a href="benefits\.html">Explore all Cerium features/);
  assert.match(section,/Excel files/);
  assert.match(section,/quote to booked job/);
});

test('feature directory describes implemented modules without claiming a live bank feed',()=>{
  const html=read('benefits.html');
  assert.equal((html.match(/<article class="feature cd" data-rv/g)||[]).length,14);
  for(const heading of ['Lead pipeline','Excel &amp; CSV lead import','Estimates and quotes','Crew assignments','Country-aware invoices','Customisable workspace'])assert.ok(html.includes(heading),heading);
  assert.match(html,/Live bank-feed connections are not yet available/);
  for(const anchor of ['win-work','deliver-work','get-paid','run-business'])assert.ok(html.includes('id="'+anchor+'"'));
});

test('marketing pages link to the full guide and do not advertise unimplemented bank feeds',()=>{
  for(const page of pages){
    const html=read(page);
    assert.match(html,/href="benefits\.html"/,page+' must link to full features');
    assert.doesNotMatch(html,/automated read-only bank deposit matching|connect your bank if you want/i,page);
  }
  assert.doesNotMatch(read('pricing.html'),/custom invoice branding &amp; logo options|automated Google review follow-up system/i);
  assert.match(read('sitemap.xml'),/https:\/\/ceriumapp\.com\/benefits\.html/);
});

test('legal pages have updated dates, no starter placeholders and accurate billing/account disclosures',()=>{
  assert.equal(TERMS_VERSION,'2026-10-26');
  const terms=read('terms.html'),privacy=read('privacy.html');
  for(const page of [terms,privacy]){
    assert.match(page,/Last updated: October 26, 2026/);
    assert.doesNotMatch(page,/STARTER TEXT|class="todo"|<!-- CHECK:|<!-- EDIT:/);
    assert.match(page,/mailto:cerium\.founders@gmail\.com/);
  }
  assert.match(terms,/payment-method authorisation/);
  assert.match(terms,/email\/password and Google sign-in/);
  assert.match(terms,/current bank connection control is not a live bank-data provider integration/i);
  assert.match(privacy,/CSV or Excel \(\.xlsx\)/);
  assert.match(privacy,/session cookie/);
  assert.match(privacy,/account-deletion control/);
});

test('benefits page inherits the landing purple ambient glow and magnetic cursor without duplicate cursor engines',()=>{
  const html=read('benefits.html');
  assert.match(html,/<div class="pg home benefits-page" id="pg"/);
  assert.match(html,/<div class="sp-grid" aria-hidden="true"><\/div>/);
  for(const asset of ['css/spatial.css','css/home.css','css/landing-workspace-cursor.css','js/workspace-cursor.js','js/home.js'])
    assert.ok(html.includes('="'+asset+'"'),'Benefits page must reuse '+asset);
  assert.equal((html.match(/src="js\/workspace-cursor\.js"/g)||[]).length,1,'one cursor engine');
  assert.doesNotMatch(html,/src="js\/cursor\.js"/,'do not mix two cursor engines');
  assert.match(html,/<span class="ac">invoice\.<\/span>/,'reuse landing brand gradient');
  assert.match(html,/rgba\(102,69,221,\.38\)/,'feature card hover preserves purple halo');
  assert.match(html,/@media\(prefers-reduced-motion:reduce\)/,'respect reduced motion');
  assert.match(read('js/home.js'),/pg\.style\.setProperty\('--px'/,'ambient moves with pointer');
  assert.match(read('js/workspace-cursor.js'),/className='workspace-cursor'/,'reuse magnetic ring');
});
