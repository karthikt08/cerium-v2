import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {COUNTRY_OPTIONS,validCountry} from '../public/js/countries.js';
import {matchingCountries,countryRowLabel} from '../public/js/country-picker.js';
import {renderWorkspaceCustomizer} from '../public/js/workspace-customizer.js';

const read=path=>readFileSync(fileURLToPath(new URL('../public/'+path,import.meta.url)),'utf8');

test('searchable dial code selector keeps country names and calling codes distinct',()=>{
  const india=matchingCountries('india').find(c=>c.value==='IN');
  const us=matchingCountries('+1').find(c=>c.value==='US');
  assert.ok(india);
  assert.equal(india.callingCode,'91');
  assert.ok(us);
  assert.equal(us.callingCode,'1');
  assert.equal(countryRowLabel(india),india.label+' | +91');
  assert.ok(matchingCountries('91').some(c=>c.value==='IN'));
  assert.ok(matchingCountries('United States').some(c=>c.value==='US'));
  assert.ok(matchingCountries('fr').some(c=>c.value==='FR'));
  assert.equal(matchingCountries('xxthereisnosuchcountry').length,0);
  assert.equal(matchingCountries('').length,COUNTRY_OPTIONS.length);
  assert.ok(validCountry(india.value));
  assert.ok(COUNTRY_OPTIONS.length>180);
});

test('phone verification remains tied to original selected country and confirmation',()=>{
  const page=read('verify.html');
  const script=read('js/verify-phone.js');
  const picker=read('js/country-picker.js');
  const css=read('css/country-picker.css');
  assert.match(page,/<select id="country" name="country" autocomplete="country"/);
  assert.match(page,/id="dial-trigger"/);
  assert.match(page,/id="dial-options" class="dial-options" role="listbox"/);
  assert.match(page,/<span>Country name<\/span><span>Country code<\/span>/);
  assert.match(page,/id="dial-search"/);
  assert.match(page,/id="country-confirm"/);
  assert.match(script,/mountCountryPicker\(/);
  assert.match(script,/countryPicker\?\.sync\(\)/);
  assert.match(script,/API\.startBillingPhone\(phone\.value,true,country\)/);
  assert.match(picker,/select\.dispatchEvent\(new Event\('change'/);
  assert.match(picker,/aria-selected/);
  assert.match(picker,/Escape/);
  assert.match(picker,/ArrowDown/);
  assert.match(picker,/select\.required=false/);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\) 106px/);
  assert.match(css,/\.dial-head[^{]*\{[^}]*overflow-y:scroll/);
  assert.match(css,/\.dial-head[^{]*\{[^}]*scrollbar-gutter:stable/);
  assert.match(css,/\.dial-options[^{]*\{[^}]*overflow-y:scroll/);
  assert.match(css,/\.dial-options[^{]*\{[^}]*scrollbar-gutter:stable/);
  assert.match(css,/\.dial-head span:last-child[^{]*\{[^}]*white-space:nowrap/);
});

test('workspace settings use a modal matching CERIUM UI, with editable suggested tools',()=>{
  const markup=renderWorkspaceCustomizer({category:'plumbing',modules:['jobs','quotes','invoices']});
  const script=read('js/workspace-customizer.js');
  const css=read('css/workspace-customizer.css');
  assert.match(markup,/<dialog id="workspace-customizer-dialog"/);
  assert.match(markup,/id="workspace-open-customizer"/);
  assert.match(markup,/id="workspace-close-customizer"/);
  assert.match(markup,/id="workspace-cancel-customizer"/);
  assert.match(markup,/aria-labelledby="ws-config-title"/);
  assert.match(markup,/aria-describedby="ws-config-description"/);
  assert.match(markup,/id="workspace-preferences-form"/);
  assert.match(markup,/id="workspace-save-modules"/);
  assert.match(markup,/id="workspace-recommend"/);
  assert.match(markup,/name="modules" value="jobs" checked/);
  assert.match(script,/modal\.showModal\(\)/);
  assert.match(script,/modal\.addEventListener\('close'/);
  assert.match(script,/saveWorkspacePreferences/);
  assert.match(css,/\.workspace-config-dialog::backdrop/);
  assert.match(css,/prefers-reduced-motion/);
  assert.doesNotMatch(markup,/<script|on(click|change|submit)=/i);
});
