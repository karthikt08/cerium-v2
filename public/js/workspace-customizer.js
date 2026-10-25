// CERIUM workspace configuration. No data is deleted or access rights changed.
import {INDUSTRY_OPTIONS,WORKSPACE_MODULES,defaultModules,recommendWorkspace} from './industry-workspaces.js';
import {escapeHTML as esc} from './workspace-model.js';

export function renderWorkspaceCustomizer(preferences={}) {
  const category=preferences.category||'other';
  const current=new Set(preferences.modules||defaultModules(category));
  const options=INDUSTRY_OPTIONS.map(i=>'<option value="'+esc(i.value)+'"'+(i.value===category?' selected':'')+'>'+esc(i.label)+'</option>').join('');
  const choices=WORKSPACE_MODULES.map(m=>'<label class="ws-pick-module"><input type="checkbox" name="modules" value="'+esc(m.id)+'"'+(current.has(m.id)?' checked':'')+'><span>'+esc(m.label)+'</span></label>').join('');
  return `<section class="panel workspace-customizer" aria-labelledby="ws-customizer-title">
    <div class="panel-header"><div><div class="panel-title"><h2 id="ws-customizer-title">Customize your workspace</h2></div>
    <p class="panel-subtitle">Your tools, in the order you need them. Hidden modules remain available and keep their records.</p></div></div>
    <div class="settings-content">
      <form id="workspace-preferences-form">
        <label class="ws-custom-field">Business type
          <select name="category" id="workspace-category">${options}</select>
        </label>
        <div class="ws-recommender">
          <label class="ws-custom-field">What do you want CERIUM to help with? (optional)
            <textarea id="workspace-work-description" maxlength="350" rows="2" placeholder="e.g. I book appointments, send estimates and collect overdue invoices"></textarea>
          </label>
          <div class="settings-actions"><button type="button" class="button secondary sm" id="workspace-recommend">Suggest tools for me</button>
          <button type="button" class="button secondary sm" id="workspace-reset-modules">Restore industry defaults</button></div>
          <p class="muted" id="workspace-recommendation-note" role="status">Private, instant rule-based suggestions. No external AI service receives your description.</p>
        </div>
        <fieldset class="ws-module-fieldset"><legend>Show these tools</legend><div class="ws-module-grid">${choices}</div></fieldset>
        <p class="form-error" id="workspace-preferences-error" role="alert" hidden></p>
        <div class="settings-actions"><button type="submit" class="button primary" id="workspace-save-modules">Save workspace</button></div>
      </form>
    </div>
  </section>`;
}

export function customizeBusinessNavigation(root,modules) {
  const nav=root.querySelector('nav[aria-label="Business tools"]');
  if(!nav)return;
  const selected=Array.isArray(modules)?modules:WORKSPACE_MODULES.map(x=>x.id);
  const links=new Map([...nav.querySelectorAll('[data-nav]')].map(link=>[link.dataset.nav,link]));
  for(const [key,link] of links) {
    link.hidden=!selected.includes(key);
    link.style.display=selected.includes(key)?'':'none';
  }
  for(const key of selected){const link=links.get(key);if(link)nav.append(link);}
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
      const rec=recommendWorkspace({
        category:f.elements.category.value,
        description:f.querySelector('#workspace-work-description').value,
        trade:getTrade()||''
      });
      apply(rec.modules,rec.explanation+' Review before saving.');
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
      await refresh();
      toast('Workspace preferences saved. Your business data is unchanged.');
    } catch(err) {
      error.hidden=false;error.textContent=err.message||'Could not save workspace preferences.';
    } finally {button.disabled=false;}
  });
}
