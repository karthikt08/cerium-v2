import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const read=path=>readFileSync(fileURLToPath(new URL('../public/'+path,import.meta.url)),'utf8');

test('mandatory setup uses the same brand, navigation structure, and font as the workspace',()=>{
  const html=read('verify.html'),theme=read('css/onboarding-theme.css'),workspace=read('css/workspace.css');
  assert.match(html,/<body class="onboarding-page">/);
  assert.match(html,/<aside class="onboarding-rail"/);
  assert.match(html,/class="onboarding-topbar"/);
  assert.match(html,/img\/cerium-logo-mark-blue\.png/);
  assert.match(html,/class="verify-card" aria-labelledby="verify-title"/);
  assert.match(theme,/grid-template-columns:224px minmax\(0,1fr\)/);
  assert.match(theme,/\.onboarding-page \.verify-card\{/);
  for(const token of ['#202635','#788191','#e7e9ef','#4263eb']){
    assert.ok(workspace.includes(token),'Workspace design token '+token);
    assert.ok(theme.includes(token),'Onboarding design token '+token);
  }
  const styles=[...html.split('</head>')[0].matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(styles.at(-4),'css/onboarding-theme.css');
  assert.equal(styles.at(-3),'css/status-pricing-night.css');
  assert.equal(styles.at(-2),'css/ui-consistency.css');
  assert.equal(styles.at(-1),'css/typography.css');
});

test('phone, business, and payment steps preserve forms and dynamic progress contract',()=>{
  const html=read('verify.html'),script=read('js/verify-phone.js');
  for(const step of ['phone','business','payment']){
    assert.match(html,new RegExp('id="step-'+step+'"'));
    assert.match(html,new RegExp('id="rail-step-'+step+'"'));
  }
  for(const id of ['start-form','code-form','phone','country','country-confirm','business-setup','mandate-panel','mandate-button','account-tools','setup-retry']){
    if(id==='account-tools')assert.match(html,/class="account-tools"/);
    else assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(script,/const current=!details\.verified\?'phone'/);
  assert.match(script,/rail\.dataset\.complete=String\(Boolean\(complete\)\)/);
  assert.match(script,/rail\.setAttribute\('aria-current','step'\)/);
  assert.match(script,/el\('rail-step-payment'\)\.hidden=mode!=='phone_and_mandate'/);
  assert.match(script,/details\.workspaceUnlocked/);
  assert.match(script,/API\.startBillingPhone/);
  assert.match(script,/API\.verifyBillingPhone/);
  assert.match(script,/reason==='phone_in_use'/);
  assert.match(script,/check\.hidden=true/);
  assert.match(script,/phone\.focus\(\)/);
  assert.match(script,/API\.getBusinessSetup/);
  assert.match(script,/startSubscriptionCheckout/);
});

test('workspace styling handles small screens, keyboard focus, reduced motion and preserves errors',()=>{
  const css=read('css/onboarding-theme.css'),wizard=read('css/business-setup.css');
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/@media\(max-width:520px\)/);
  assert.match(css,/focus-visible/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/\.alert\.error/);
  assert.match(css,/\[aria-invalid=true\]/);
  assert.match(wizard,/\.business-wizard \.wizard-progress \[aria-current=step\]/);
  assert.match(wizard,/\.business-wizard \.workspace-picker/);
  assert.match(wizard,/\.business-wizard \.wizard-review/);
  assert.match(wizard,/\.business-wizard \[aria-invalid=true\]/);
  assert.match(wizard,/\.business-wizard \.business-errors/);
});
