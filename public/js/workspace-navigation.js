import {WORKSPACE_CATEGORIES,WORKSPACE_UTILITIES,categoryFeatures,categoryDestination,featureEnabled,workspacePathLabel} from './workspace-registry.js';
import {escapeHTML as esc} from './workspace-model.js';
import {featureRecordCount} from './workspace-counts.js';
const icon=name=>'<svg class="icon" aria-hidden="true"><use href="#i-'+name+'"></use></svg>';
export function renderCategoryNavigation(){
  return WORKSPACE_CATEGORIES.map(c=>`<a class="nav-link" href="#${c.id}" data-category="${c.id}" aria-label="${esc(c.label)}" title="${esc(c.label)}">${icon(c.icon)}<span>${esc(c.label)}</span><span class="nav-count" data-category-count="${c.id}" hidden></span></a>`).join('');
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
      badge.setAttribute('aria-hidden','true'); // Included in the link's descriptive name.
    }
    const categoryLabel=WORKSPACE_CATEGORIES.find(c=>c.id===category)?.label||category;
    const details=recordCount?.count?' · '+recordCount.label+' in '+destination.label:'';
    link.setAttribute('aria-label',categoryLabel+details);
    link.title=categoryLabel+details;
  }
}
export function renderFeatureWorkspace(route,modules,content,workspace){
  if(!route.category||route.category==='overview')return content;
  const tabs=categoryFeatures(route.category,modules,route.id);
  const category=WORKSPACE_CATEGORIES.find(c=>c.id===route.category);
  const hidden=!featureEnabled(route,modules);
  return `<section class="category-workspace" aria-label="${esc(category.label)}">
    <div class="workspace-category-heading"><p class="eyebrow">${esc(category.label)}</p><a class="text-button" href="#settings/tools" data-nav="settings/tools">Customize tools ${icon('arrow')}</a></div>
    <div class="workspace-tab-scroll"><div class="workspace-feature-tabs" role="tablist" aria-label="${esc(category.label)} features">
      ${tabs.map(f=>`<a role="tab" id="workspace-tab-${f.id}" class="workspace-feature-tab" href="${f.href}" data-feature="${f.id}" data-nav="${f.href.slice(1)}" aria-selected="${f.id===route.id}" aria-controls="workspace-feature-panel" tabindex="${f.id===route.id?'0':'-1'}" aria-label="${esc(f.label)}${featureRecordCount(f,workspace)?.count?' · '+esc(featureRecordCount(f,workspace).label):''}"><span class="workspace-feature-label">${esc(f.label)}</span>${featureRecordCount(f,workspace)?.count?'<span class="workspace-feature-count" aria-hidden="true">'+featureRecordCount(f,workspace).count+'</span>':''}</a>`).join('')}
    </div></div>
    <section id="workspace-feature-panel" class="workspace-feature-panel" role="tabpanel" aria-labelledby="workspace-tab-${route.id}" tabindex="0">
      ${hidden?`<div class="notice hidden-tool-notice" role="status"><p>This tool is hidden from your workspace. Your saved records remain available through this link. <a href="#settings/tools" data-nav="settings/tools">Show it in Customize Tools →</a></p></div>`:''}${content}
    </section></section>`;
}
export function featureTitle(route){return workspacePathLabel(route);}

// Reveal direct-linked tabs horizontally without moving the page's vertical scroll.
export function revealActiveFeature(root){
  const strip=root.querySelector('.workspace-tab-scroll'),tab=root.querySelector('.workspace-feature-tab[aria-selected="true"]');
  if(!strip||!tab)return;
  const edge=strip.getBoundingClientRect(),active=tab.getBoundingClientRect();
  if(active.left<edge.left)strip.scrollLeft-=edge.left-active.left+4;
  else if(active.right>edge.right)strip.scrollLeft+=active.right-edge.right+4;
}
