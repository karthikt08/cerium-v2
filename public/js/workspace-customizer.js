// CERIUM workspace configuration. No data is deleted or access rights changed.
import {INDUSTRY_OPTIONS,WORKSPACE_MODULES,defaultModules} from './industry-workspaces.js';
import {recommendBusinessTools} from './business-tool-advisor.js';
import {escapeHTML as esc} from './workspace-model.js';

export function renderWorkspaceCustomizer(preferences={}) {
  const category=preferences.category||'other';
  const current=new Set(preferences.modules||defaultModules(category));
  const options=INDUSTRY_OPTIONS.map(i=>'<option value="'+esc(i.value)+'"'+(i.value===category?' selected':'')+'>'+esc(i.label)+'</option>').join('');
  const choices=WORKSPACE_MODULES.map(m=>'<label class="ws-pick-module"><input type="checkbox" name="modules" value="'+esc(m.id)+'"'+(current.has(m.id)?' checked':'')+'><span>'+esc(m.label)+'</span></label>').join('');
  return `<section class="panel workspace-customizer" aria-labelledby="ws-customizer-title">
    <div class="ws-launch">
      <div class="ws-launch-icon" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      <div class="ws-launch-copy">
        <p class="ws-eyebrow">PERSONALIZED WORKSPACE</p>
        <h2 id="ws-customizer-title">A workspace built <span class="ac">around your work.<svg class="ul" viewBox="0 0 300 14" aria-hidden="true"><path pathLength="1" d="M3 9C60 3 120 12 180 6s90 3 117 0"/></svg></span></h2>
        <p>Keep the tools you need close. Everything else stays safe and available.</p>
      </div>
      <button type="button" class="button primary" id="workspace-open-customizer" aria-haspopup="dialog" aria-controls="workspace-customizer-dialog">Customize tools <span aria-hidden="true">→</span></button>
    </div>
  </section>
  <dialog id="workspace-customizer-dialog" class="workspace-config-dialog" aria-labelledby="ws-config-title" aria-describedby="ws-config-description">
    <div class="ws-config-hero">
      <div class="ws-config-heading">
        <p class="ws-eyebrow">CERIUM · YOUR WORKSPACE</p>
        <h2 id="ws-config-title">Make it <span class="ac">yours.<svg class="ul" viewBox="0 0 300 14" aria-hidden="true"><path pathLength="1" d="M3 9C60 3 120 12 180 6s90 3 117 0"/></svg></span></h2>
        <p id="ws-config-description">Choose what matters to your business. You can always change it later.</p>
      </div>
      <button type="button" class="ws-config-close" id="workspace-close-customizer" aria-label="Close customization dialog">×</button>
    </div>
    <form id="workspace-preferences-form" class="ws-config-form">
      <label class="ws-custom-field">Your business type
        <select name="category" id="workspace-category">${options}</select>
      </label>
      <div class="ws-recommender">
        <div class="ws-recommend-title"><span aria-hidden="true" class="ws-spark">✦</span><strong>Smart setup assistant</strong><span class="ws-privacy-badge">Private &amp; local</span></div>
        <label class="ws-custom-field">What does your working day look like? (optional)
          <textarea id="workspace-work-description" maxlength="350" rows="2" placeholder="e.g. I book appointments, send estimates and collect overdue invoices"></textarea>
        </label>
        <div class="ws-actions-inline"><button type="button" class="button secondary sm" id="workspace-recommend">Suggest my tools</button>
        <button type="button" class="button secondary sm" id="workspace-reset-modules">Restore defaults</button></div>
        <p class="muted" id="workspace-recommendation-note" role="status">Instant rule-based suggestions. Your description stays in this browser.</p>
      </div>
      <fieldset class="ws-module-fieldset"><legend>Modules to display <span>(choose at least one)</span></legend><div class="ws-module-grid">${choices}</div></fieldset>
      <p class="ws-config-data-note">Hidden modules keep all their existing records and can be enabled again anytime.</p>
      <p class="form-error" id="workspace-preferences-error" role="alert" hidden></p>
      <div class="ws-config-footer">
        <button type="button" class="button secondary" id="workspace-cancel-customizer">Cancel</button>
        <button type="submit" class="button primary" id="workspace-save-modules">Save my workspace</button>
      </div>
    </form>
  </dialog>`;
}

export function customizeBusinessNavigation(root,modules) {
  const nav=root.querySelector('nav[aria-label="Business tools"]');
  if(!nav)return;
  const selected=Array.isArray(modules)?modules:WORKSPACE_MODULES.map(x=>x.id);
  const links=new Map([...nav.querySelectorAll('[data-nav]')].map(link=>[link.dataset.nav,link]));
  for(const [key,link] of links) {
    const visible=key==='overview'||key==='marketing'||selected.includes(key);
    link.hidden=!visible;
    link.style.display=visible?'':'none';
  }
  for(const key of selected){const link=links.get(key);if(link)nav.append(link);}
  // Overview and Marketing are shared workspace hubs; neither is hidden by module preferences.
  const overview=links.get('overview');
  if(overview)nav.prepend(overview);
}

export function renderOverviewTools(){
  return `<section class="panel overview-tools" data-overview-tools hidden aria-labelledby="overview-tools-title">
    <div class="panel-header"><div><h2 id="overview-tools-title">Your workspace tools</h2>
    <p class="panel-subtitle">Open a tool to get started.</p></div></div>
    <div class="overview-tool-links">${WORKSPACE_MODULES.map(module=>`<a class="overview-tool-link" href="#${esc(module.id)}" data-nav="${esc(module.id)}" data-workspace-module="${esc(module.id)}"><span>${esc(module.label)}</span><span aria-hidden="true">→</span></a>`).join('')}</div>
  </section>`;
}

export function customizeOverview(root,modules){
  const selected=new Set(Array.isArray(modules)?modules:WORKSPACE_MODULES.map(module=>module.id));
  root.querySelectorAll('[data-workspace-module]').forEach(element=>{
    element.hidden=!selected.has(element.dataset.workspaceModule);
    element.style.display=element.hidden?'none':'';
  });
  for(const grid of root.querySelectorAll('.metrics-grid,.dashboard-grid')){
    grid.hidden=![...grid.children].some(card=>!card.hidden);
  }
  const tools=root.querySelector('[data-overview-tools]');
  if(tools)tools.hidden=!root.querySelector('.dashboard-grid')?.hidden;
}

export function wireWorkspaceCustomizer({api,refresh,toast,getTrade}) {
  function form() {return document.getElementById('workspace-preferences-form');}
  function apply(modules,note){
    const f=form();if(!f)return;
    const selected=new Set(modules);
    f.querySelectorAll('input[name="modules"]').forEach(i=>{i.checked=selected.has(i.value);});
    const label=f.querySelector('#workspace-recommendation-note');
    if(label)label.textContent=note||'You can adjust these suggestions before saving.';
  }
  // Ask Cerium can hand over an allowlisted recommendation; nothing is saved until
  // the user reviews the checkboxes and clicks Save my workspace.
  let pendingAdvisorModules=null;
  function showAdvisorReview(){
    if(!pendingAdvisorModules)return;
    const modal=document.getElementById('workspace-customizer-dialog');
    if(!modal)return;
    apply(pendingAdvisorModules,'Suggested by Ask Cerium. Review these tools and click Save my workspace to apply them.');
    pendingAdvisorModules=null;
    if(!modal.open)modal.showModal();
    modal.querySelector('#workspace-save-modules')?.focus();
  }
  document.addEventListener('cerium:review-tools',event=>{
    const requested=event.detail?.modules;
    const allowed=new Set(WORKSPACE_MODULES.map(module=>module.id));
    if(!Array.isArray(requested)||!requested.length||requested.length>allowed.size||
      requested.some(id=>!allowed.has(id))||new Set(requested).size!==requested.length)return;
    pendingAdvisorModules=[...requested];
    if(location.hash==='#settings')showAdvisorReview();
    else location.hash='#settings';
  });
  window.addEventListener('hashchange',()=>{
    if(location.hash==='#settings'&&pendingAdvisorModules)queueMicrotask(showAdvisorReview);
  });
  document.addEventListener('click',e=>{
    const open=e.target.closest('#workspace-open-customizer');
    if(open){
      const modal=document.getElementById('workspace-customizer-dialog');
      if(!modal)return;
      if(!modal.dataset.focusListener){
        modal.addEventListener('close',()=>document.getElementById('workspace-open-customizer')?.focus());
        modal.dataset.focusListener='true';
      }
      modal.showModal();
      modal.querySelector('#workspace-category')?.focus();
      return;
    }
    if(e.target.closest('#workspace-close-customizer, #workspace-cancel-customizer')){
      document.getElementById('workspace-customizer-dialog')?.close();
    }
  });
  document.addEventListener('change',e=>{
    if(e.target.id==='workspace-category'){
      const category=e.target.value;
      apply(defaultModules(category),category==='other'?'Choose the tools you want; CERIUM will keep other modules available.':'Industry defaults applied. You can adjust them below.');
    }
  });
  document.addEventListener('click',e=>{
    if(e.target.closest('#workspace-reset-modules')){
      const f=form();if(f)apply(defaultModules(f.elements.category.value),'Industry defaults restored. Save to keep this selection.');
    }
    if(e.target.closest('#workspace-recommend')){
      const f=form();if(!f)return;
      const rec=recommendBusinessTools({
        category:f.elements.category.value,
        description:f.querySelector('#workspace-work-description').value,
        trade:getTrade()||''
      });
      if(rec.needsMoreInfo){
        f.querySelector('#workspace-recommendation-note').textContent=rec.reply;
        return;
      }
      apply(rec.modules,rec.reply+' Review before saving.');
    }
  });
  document.addEventListener('submit',async e=>{
    if(e.target.id!=='workspace-preferences-form')return;
    e.preventDefault();
    const f=e.target,button=f.querySelector('#workspace-save-modules');
    const selected=[...f.querySelectorAll('input[name="modules"]:checked')].map(i=>i.value);
    const error=f.querySelector('#workspace-preferences-error');
    error.hidden=true;
    if(!selected.length){error.hidden=false;error.textContent='Choose at least one tool to show.';return;}
    button.disabled=true;
    try {
      await api.saveWorkspacePreferences({category:f.elements.category.value,modules:selected});
      document.getElementById('workspace-customizer-dialog')?.close();
      await refresh();
      toast('Workspace preferences saved. Your business data is unchanged.');
    } catch(err) {
      error.hidden=false;error.textContent=err.message||'Could not save workspace preferences.';
    } finally {button.disabled=false;}
  });
}
