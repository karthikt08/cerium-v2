import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {billingPlan} from '../public/js/countries.js';

const read=relative=>readFileSync(new URL('../public/'+relative,import.meta.url),'utf8');

test('regional pricing preview identifies Starter as the only purchasable plan',()=>{
  const home=read('index.html'),pricing=read('pricing.html');
  assert.match(home,/Starter · Available now/);
  assert.match(home,/Proposed plans · not available yet/);
  assert.match(pricing,/Growth and Team are proposed upgrades/);
  assert.match(pricing,/not enabled in billing/);
  assert.match(pricing,/The Starter prices and trial terms are the current offer/);
  assert.match(pricing,/href="signup\.html"[^>]*>Start 15-day trial/);
  assert.equal((pricing.match(/data-preview-plan="growth"/g)||[]).length,1);
  assert.equal((pricing.match(/data-preview-plan="team"/g)||[]).length,1);
  assert.match(home,/href="css\/plan-preview\.css"/);
  assert.match(pricing,/href="css\/plan-preview\.css"/);
});

test('proposed country prices remain isolated from subscription billing',()=>{
  const js=read('js/region-pricing.js');
  const cases={
    high:{growth:39,team:69},
    upperMiddle:{growth:31,team:55},
    lowerMiddle:{growth:23,team:41},
    low:{growth:16,team:28},
    india:{growth:999,team:1749},
    unclassified:{growth:39,team:69}
  };
  for(const [group,prices] of Object.entries(cases))
    assert.ok(js.includes(group+':{growth:'+prices.growth+',team:'+prices.team+'}'),'preview price for '+group);
  assert.match(js,/const paintProposed=plan=>/);
  assert.match(js,/paintProposed\(plan\)/);
  assert.match(js,/\[data-preview-plan\]/);
  assert.match(js,/plan\.currency==='INR'/);
  assert.match(js,/paintAnnual\(plan\)/);
  assert.equal(billingPlan('US').monthlyPrice,20);
  assert.equal(billingPlan('BR').monthlyPrice,16);
  assert.equal(billingPlan('KE').monthlyPrice,12);
  assert.equal(billingPlan('UG').monthlyPrice,8);
  assert.equal(billingPlan('IN').monthlyPrice,500);
  assert.doesNotMatch(read('js/countries.js'),/proposedMonthly|growth:39|team:69/);
});

test('planned upgrades cannot be mistaken for an active checkout CTA',()=>{
  const pricing=read('pricing.html');
  const growth=pricing.split('<h3>Growth</h3>')[1]?.split('<h3>Team</h3>')[0]||'';
  const team=pricing.split('<h3>Team</h3>')[1]?.split('<p class="planned-prices-footnote">')[0]||'';
  for(const card of [growth,team]){
    assert.match(card,/href="contact\.html"/);
    assert.doesNotMatch(card,/href="signup\.html"/);
  }
  assert.match(pricing,/Proposed · not available/);
  assert.match(pricing,/prices are proposals only|proposals only/i);
});
