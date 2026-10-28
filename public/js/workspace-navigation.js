import {WORKSPACE_CATEGORIES,WORKSPACE_UTILITIES,categoryFeatures,categoryDestination,featureEnabled,workspacePathLabel} from './workspace-registry.js';
import {escapeHTML as esc} from './workspace-model.js';
import {featureRecordCount} from './workspace-counts.js';
const icon=name=>'<svg class="icon" aria-hidden="true"><use href="#i-'+name+'"></use></svg>';

export const SIDEBAR_CATEGORIES=Object.freeze(WORKSPACE_CATEGORIES.filter(c=>!['settings','assistant','support'].includes(c.id)));

export {FEATURE_SUBFEATURES} from './workspace-subviews.js';
import {subfeaturesFor,subviewHref} from './workspace-subviews.js';

// A single compact selector replaces both tab bars. Registered routes,
// including saved deep links, remain intact.
function renderWorkspacePicker(route,features,workspace){
  const options=features.map(f=>{
    const count=featureRecordCount(f,workspace);
    const baseLabel=f.label+(count?.count?' · '+count.count:'');
    const options=[
      `<option value="${esc(f.href)}" ${route.href===f.href?'selected':''}>${esc(baseLabel)}</option>`,
      ...subfeaturesFor(f).map(sub=>{
        const href=subviewHref(f,sub.id);
        return `<option value="${esc(href)}" ${route.href===href?'selected':''}>↳ ${esc(sub.label)}</option>`;
      })
    ];
    return `<optgroup label="${esc(f.label)}">${options.join('')}</optgroup>`;
  });
  return `<label class="workspace-view-picker" for="workspace-destination"><span>Feature / view</span>
    <select id="workspace-destination" data-workspace-destination aria-label="Choose a feature or view">${options.join('')}</select></label>`;
}

export function renderCategoryNavigation(){
  return SIDEBAR_CATEGORIES.map(c=>`<a class="nav-link" href="#${c.id}" data-category="${c.id}" aria-label="${esc(c.label)}" title="${esc(c.label)}">${icon(c.icon)}<span>${esc(c.label)}</span><span class="nav-count" data-category-count="${c.id}" hidden></span></a>`).join('');
}
export function renderUtilityNavigation(){
  return WORKSPACE_UTILITIES.map(u=>`<a class="nav-link" href="${u.href}" data-nav="${u.href.slice(1)}" aria-label="${esc(u.label)}" title="${esc(u.label)}">${icon(u.id==='support'?'support':'settings')}<span>${esc(u.label)}</span></a>`).join('');
}
export function updateCategoryNavigation(root,{modules,route,lastUsed,workspace}){
  for(const link of root.querySelectorAll('[data-category]')){
    const category=link.dataset.category,active=category===route.category;
    link.hidden=!categoryFeatures(category,modules).length&&!active;
    const destination=active?route:categoryDestination(category,modules,lastUsed);
    link.href=destination.href;
    if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    const recordCount=featureRecordCount(destination,workspace);
    const badge=link.querySelector('[data-category-count]');
    if(badge){
      badge.hidden=!recordCount?.count;
      badge.textContent=recordCount?.count?String(recordCount.count):'';
      badge.title=recordCount?.label||'';
      badge.setAttribute('aria-hidden','true');
    }
    const categoryLabel=WORKSPACE_CATEGORIES.find(c=>c.id===category)?.label||category;
    const details=recordCount?.count?' · '+recordCount.label+' in '+destination.label:'';
    link.setAttribute('aria-label',categoryLabel+details);
    link.title=categoryLabel+details;
  }
}
export function renderFeatureWorkspace(route,modules,content,workspace){
  // Overview and utility pages remain standalone like the original workspace.
  if(!route.category||['overview','settings','assistant','support'].includes(route.category))return content;
  const features=categoryFeatures(route.category,modules,route.id);
  const category=WORKSPACE_CATEGORIES.find(c=>c.id===route.category);
  const hidden=!featureEnabled(route,modules);
  return `<section class="category-workspace" aria-label="${esc(category.label)}">
    <div class="workspace-category-heading">
      <p class="eyebrow">${esc(category.label)}</p>
      <div class="workspace-category-actions">${renderWorkspacePicker(route,features,workspace)}<a class="text-button" href="#settings/tools" data-nav="settings/tools">Customize tools ${icon('arrow')}</a></div>
    </div>
    <section id="workspace-feature-panel" class="workspace-feature-panel" role="region" aria-label="${esc(route.label)} content">
      <div class="workspace-feature-content">
        ${hidden?`<div class="notice hidden-tool-notice" role="status"><p>This tool is hidden from your workspace. Your saved records remain available through this link. <a href="#settings/tools" data-nav="settings/tools">Show it in Customize Tools →</a></p></div>`:''}${content}
      </div>
    </section>
  </section>`;
}
export function featureTitle(route){return workspacePathLabel(route);}

// Kept as a harmless compatibility hook for existing callers.
export function revealActiveFeature(){ }
