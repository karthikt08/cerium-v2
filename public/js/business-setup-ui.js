import {COUNTRY_OPTIONS,countryName} from './countries.js';
import {US_STATE_OPTIONS,US_TIME_ZONE_OPTIONS,businessTimeZoneOptions} from './us-market.js';
import {INDIA_STATE_OPTIONS} from './india-market.js';
import {businessSetupSteps,BUSINESS_SETUP_FIELDS} from './business-profile.js';

const markup=`<form id="business-form" class="business-wizard" hidden>
<p class="wizard-required">REQUIRED BUSINESS SETUP</p>
<ol id="business-step-list" class="wizard-progress" aria-label="Business setup steps"></ol>
<p id="business-step-count" class="hint"></p>
<h2 id="business-step-title" tabindex="-1"></h2>
<p id="business-step-help" class="hint"></p>
<p class="verified-business-country" id="business-country-label"></p>
<label id="preview-country-field" hidden>Business country<select id="preview-country"></select></label>
<fieldset data-business-step="basics"><legend class="wizard-sr">Business basics</legend><div class="business-fields">        <label>Contact name<input id="biz-contact" name="name" autocomplete="name" maxlength="120" required></label>
        <label>Business / trading name<input id="biz-name" name="businessName" autocomplete="organization" maxlength="120" required></label>
        <label>Business contact email<input id="biz-email" name="businessEmail" type="email" autocomplete="email" maxlength="254" required></label>
        <label>Industry / main service<input id="biz-trade" name="trade" list="business-trades" maxlength="120" placeholder="e.g. Plumbing, consulting, retail" required></label>
        <datalist id="business-trades"><option value="Home repairs"><option value="Plumbing"><option value="Electrical services"><option value="Cleaning"><option value="Landscaping"><option value="Consulting"><option value="Retail"><option value="Professional services"></datalist>
</div></fieldset>
<fieldset data-business-step="address"><legend class="wizard-sr">Business address</legend><div class="business-fields">        <label class="business-wide">Business street address<input id="biz-address" name="businessAddress" autocomplete="address-line1" maxlength="160" required></label>
        <label>City / locality<input id="biz-city" name="businessCity" autocomplete="address-level2" maxlength="80" required></label>
        <label id="biz-us-state-field" hidden>State<select id="biz-us-state" name="usState" autocomplete="address-level1"></select></label>
        <label id="biz-india-state-field" hidden>State / union territory<select id="biz-india-state" name="indiaState" autocomplete="address-level1"></select></label>
        <label id="biz-region-field">State / region (optional)<input id="biz-region" name="businessRegion" autocomplete="address-level1" maxlength="80"></label>
        <label><span id="biz-postal-label">Postal code (optional)</span><input id="biz-postal" name="businessPostalCode" autocomplete="postal-code" maxlength="20"></label>
        <label class="business-wide">Business time zone<select id="biz-time-zone" name="timeZone" required></select><span class="hint">Appointments and reminders use this time zone.</span></label>
</div></fieldset>
<fieldset data-business-step="tax"><legend class="wizard-sr">GST registration</legend><div class="business-fields">        <label>Is your business GST-registered?<select id="biz-gst-registration" name="gstRegistration"><option value="">Choose an option</option><option value="not_registered">No, not GST-registered</option><option value="registered">Yes, GST-registered</option></select></label>
        <label id="biz-gstin-field" hidden>GSTIN<input id="biz-gstin" name="gstin" maxlength="15" placeholder="15-character GSTIN"></label>
        <p class="hint business-wide">A GSTIN is required only when you select GST-registered. You can use CERIUM without GST registration.</p>
</div></fieldset>
<fieldset data-business-step="review"><legend class="wizard-sr">Review and confirm</legend><dl id="business-review" class="wizard-review"></dl>      <label class="country-check"><input type="checkbox" name="confirmBusinessDetails" id="biz-confirm" required><span>I confirm these details are accurate and I am authorized to manage this business.</span></label>
</fieldset>
<ul id="business-errors" class="business-errors" role="alert" hidden></ul>
<div class="wizard-actions"><button type="button" id="business-previous" class="secondary">Back</button><button type="submit" class="primary" id="business-submit">Continue</button></div>
<a id="business-back" href="/app.html#settings" hidden>Back to workspace settings</a>
</form>`;

const copy={
  basics:['Introduce your business','Enter the business and contact details you want to use with customers. Independent operators can use their own name.'],
  address:['Where does your business operate?','Add your business address and the time zone used for appointments and reminders.'],
  tax:['Confirm your GST status','Select whether you are GST-registered. Only registered businesses need a GSTIN.'],
  review:['Review your business information','Check these details before continuing. Use Back to correct anything.']
};

export function mountBusinessSetup(root,{api,onComplete,editing=false}){
  root.innerHTML=markup;
  const el=id=>root.querySelector('#'+id),form=el('business-form');
  let setup,identity,screen,busy=false,initializedCountry;
  const select=(id,options,value)=>{
    const node=el(id);node.replaceChildren();
    for(const item of options){const option=document.createElement('option');option.value=item.value;option.textContent=item.label;node.append(option);}
    node.value=value||'';
  };
  const gst=()=>{
    const registered=el('biz-gst-registration').value==='registered';
    el('biz-gstin-field').hidden=!registered;el('biz-gstin').required=registered;
    if(!registered)el('biz-gstin').value='';
  };
  function populate(){
    const p=setup.draft,country=setup.country,ind=country==='IN',us=country==='US';
    for(const key of Object.values(BUSINESS_SETUP_FIELDS).flat())if(form.elements[key])form.elements[key].value=p[key]||'';
    select('biz-us-state',[{value:'',label:'Choose state'},...US_STATE_OPTIONS],p.usState);
    select('biz-india-state',[{value:'',label:'Choose state / UT'},...INDIA_STATE_OPTIONS],p.indiaState);
    el('biz-us-state-field').hidden=!us;el('biz-us-state').required=us;el('biz-us-state').disabled=!us;
    el('biz-india-state-field').hidden=!ind;el('biz-india-state').required=ind;el('biz-india-state').disabled=!ind;
    el('biz-region-field').hidden=ind||us;el('biz-region').disabled=ind||us;
    el('biz-postal-label').textContent=ind?'PIN code':us?'ZIP code':'Postal code (optional)';
    el('biz-postal').required=ind||us;el('biz-postal').maxLength=ind?6:us?10:20;
    el('biz-postal').pattern=ind?'[1-9][0-9]{5}':us?'[0-9]{5}(-[0-9]{4})?':'.*';
    el('biz-postal').inputMode=ind?'numeric':'text';
    select('biz-time-zone',ind?[{value:'Asia/Kolkata',label:'India Standard Time (Asia/Kolkata)'}]
      :[{value:'',label:'Choose business time zone'},...(us?US_TIME_ZONE_OPTIONS:businessTimeZoneOptions(p.timeZone))],ind?'Asia/Kolkata':p.timeZone);
    el('biz-gst-registration').required=ind;gst();
    select('preview-country',COUNTRY_OPTIONS,setup.country);
    initializedCountry=country;
  }
  function review(){
    const p=setup.draft,items=[['Business name',p.businessName],['Contact name',p.name],['Business email',p.businessEmail],['Industry / service',p.trade],
      ['Country',countryName(setup.country)],['Street address',p.businessAddress],['City / locality',p.businessCity],
      ['State / region',setup.country==='IN'?INDIA_STATE_OPTIONS.find(x=>x.value===p.indiaState)?.label:setup.country==='US'?US_STATE_OPTIONS.find(x=>x.value===p.usState)?.label:p.businessRegion],
      ['Postal code',p.businessPostalCode],['Business time zone',p.timeZone]];
    if(setup.country==='IN')items.push(['GST registration',p.gstRegistration==='registered'?'Registered':'Not registered'],['GSTIN',p.gstin]);
    el('business-review').replaceChildren();
    for(const [label,value] of items){if(!value)continue;const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;el('business-review').append(dt,dd);}
  }
  function render(focus=false){
    const steps=businessSetupSteps(setup.country),index=steps.indexOf(screen);
    for(const fieldset of form.querySelectorAll('[data-business-step]')){
      fieldset.hidden=fieldset.dataset.businessStep!==screen;fieldset.disabled=fieldset.hidden;
    }
    el('business-step-list').replaceChildren();
    for(const [i,step] of steps.entries()){
      const li=document.createElement('li');li.textContent=(i+1)+'. '+({basics:'Business',address:'Address',tax:'GST',review:'Review'})[step];
      if(step===screen)li.setAttribute('aria-current','step');if(i<index)li.dataset.complete='true';el('business-step-list').append(li);
    }
    el('business-step-count').textContent='Step '+(index+1)+' of '+steps.length+' · Finish setup to enter your workspace';
    el('business-step-title').textContent=copy[screen][0];el('business-step-help').textContent=copy[screen][1];
    el('business-country-label').textContent=countryName(setup.country)+' · '+(setup.country==='IN'?'INR':'USD')+(identity.phoneMasked?' · Verified phone '+identity.phoneMasked:' · Offline preview');
    el('business-previous').hidden=index===0;el('business-previous').disabled=busy;
    el('business-submit').disabled=busy;el('business-submit').textContent=screen==='review'?(editing?'Save business details':'Confirm business and continue'):'Save and continue';
    el('preview-country-field').hidden=!setup.countryEditable;el('preview-country').disabled=busy||screen!=='basics';
    el('business-back').hidden=!(editing&&setup.complete);
    if(screen==='review')review();
    if(focus)el('business-step-title').focus();
  }
  function errors(err){
    const fields=err.data?.fields||err.fields||{form:err.message||'Could not save. Please try again.'};
    const step=Object.keys(BUSINESS_SETUP_FIELDS).find(step=>Object.keys(fields).some(key=>BUSINESS_SETUP_FIELDS[step].includes(key)));
    if(step&&businessSetupSteps(setup.country).includes(step)){screen=step;render();}
    el('business-errors').replaceChildren();
    for(const [key,message] of Object.entries(fields)){
      const li=document.createElement('li');li.textContent=message;el('business-errors').append(li);form.elements[key]?.setAttribute('aria-invalid','true');
    }
    el('business-errors').hidden=false;form.querySelector('[aria-invalid=true]')?.focus();
  }
  const clearErrors=()=>{el('business-errors').hidden=true;for(const node of form.querySelectorAll('[aria-invalid]'))node.removeAttribute('aria-invalid');};
  el('biz-gst-registration').addEventListener('change',gst);
  el('business-back').addEventListener('click',event=>{
    if(api.localBusinessSetup&&editing&&setup.complete){event.preventDefault();onComplete();}
  });
  el('business-previous').addEventListener('click',()=>{
    if(busy)return;clearErrors();const steps=businessSetupSteps(setup.country);screen=steps[steps.indexOf(screen)-1];render(true);
  });
  el('preview-country').addEventListener('change',async()=>{
    if(busy)return;busy=true;render();
    try{setup=await api.selectBusinessSetupCountry(el('preview-country').value);screen=setup.step;populate();}
    catch(err){errors(err);}finally{busy=false;render(true);}
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;clearErrors();busy=true;render();
    try{
      if(screen==='review'){await api.completeBusinessSetup(el('biz-confirm').checked);await onComplete();return;}
      const fields={};for(const key of BUSINESS_SETUP_FIELDS[screen])if(!form.elements[key].disabled)fields[key]=form.elements[key].value;
      setup=await api.saveBusinessSetupStep(screen,fields);screen=setup.step;el('biz-confirm').checked=false;render(true);
    }catch(err){errors(err);}finally{busy=false;render();}
  });
  return {show(state,proof={}){setup=state;identity=proof;screen=state.step;if(initializedCountry!==state.country)populate();root.hidden=false;form.hidden=false;render();},hide(){root.hidden=true;}};
}
