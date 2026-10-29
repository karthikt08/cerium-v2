import {WORKSPACE_CATEGORIES,WORKSPACE_UTILITIES,categoryFeatures,categoryDestination,featureEnabled,workspacePathLabel} from './workspace-registry.js';
import {escapeHTML as esc} from './workspace-model.js';
import {featureRecordCount} from './workspace-counts.js';
const icon=name=>'<svg class="icon" aria-hidden="true"><use href="#i-'+name+'"></use></svg>';

export const SIDEBAR_CATEGORIES=Object.freeze(WORKSPACE_CATEGORIES.filter(c=>!['settings','assistant','support'].includes(c.id)));

export {FEATURE_SUBFEATURES} from './workspace-subviews.js';
import {subfeaturesFor,subviewHref,selectedSubview,subviewCount} from './workspace-subviews.js';

// Two connected but visually distinct navigation levels. All destinations
// remain ordinary links, so old bookmarks, keyboard users and no-JS fallbacks
// keep their canonical hash routes. No feature content is wrapped in tab chrome.
function renderBracketNavigation(route,features,workspace){
  const first=features.map(feature=>{
    const active=feature.id===route.id;
    const count=featureRecordCount(feature,workspace);
    const aria=feature.label+(count?.count?' · '+count.label:'');
    return `<a class="workspace-feature-tab${active?' active':''}" href="${feature.href}" data-nav="${feature.href.slice(1)}" data-feature="${feature.id}" ${active?'aria-current="page"':''} aria-label="${esc(aria)}"><span class="workspace-feature-label">${esc(feature.label)}</span></a>`;
  }).join('');
  const subfeatures=subfeaturesFor(route);
  const selected=selectedSubview(route);
  const second=subfeatures.map(sub=>{
    const href=subviewHref(route,sub.id),active=sub.id===selected;
    const count=subviewCount({...route,subview:sub.id},workspace);
    const aria=sub.label+(count!==null?' · '+count+' records':'');
    return `<a class="workspace-subfeature-tab${active?' active':''}" href="${href}" data-nav="${href.slice(1)}" data-subfeature="${sub.id}" ${active?'aria-current="page"':''} aria-label="${esc(aria)}"><span class="workspace-subfeature-label">${esc(sub.label)}</span></a>`;
  }).join('');
  return `<div class="workspace-angular-navigation" aria-label="${esc(route.label)} navigation">
    <div class="workspace-tab-scroll"><nav class="workspace-feature-tabs" aria-label="${esc(route.category)} subfeatures">${first}</nav></div>
    ${second?`<div class="workspace-subfeature-strip"><nav class="workspace-subfeature-bar" aria-label="${esc(route.label)} views">${second}</nav></div>`:''}
  </div>`;
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
      <div class="workspace-category-meta">
        <p class="eyebrow">${esc(category.label)}</p>
        ${category.description?`<p class="workspace-category-desc">${esc(category.description)}</p>`:''}
      </div>
      <div class="workspace-category-actions"><a class="text-button" href="#settings/tools" data-nav="settings/tools">Customize tools ${icon('arrow')}</a></div>
    </div>
    ${renderBracketNavigation(route,features,workspace)}
    <section id="workspace-feature-panel" class="workspace-feature-panel" role="region" aria-label="${esc(route.label)} content">
      <div class="workspace-feature-content">
        ${hidden?`<div class="notice hidden-tool-notice" role="status"><p>This tool is hidden from your workspace. Your saved records remain available through this link. <a href="#settings/tools" data-nav="settings/tools">Show it in Customize Tools →</a></p></div>`:''}${content}
      </div>
    </section>
  </section>`;
}
export function featureTitle(route){return workspacePathLabel(route);}

// Scroll only the tab strip, never the page's vertical workspace position.
export function revealActiveFeature(root){
  if(!root)return;
  for(const [stripSelector,activeSelector] of [
    ['.workspace-tab-scroll','.workspace-feature-tab.active'],
    ['.workspace-subfeature-strip','.workspace-subfeature-tab.active']
  ]){
    const strip=root.querySelector(stripSelector),tab=strip?.querySelector(activeSelector);
    if(!strip||!tab)continue;
    const edge=strip.getBoundingClientRect(),target=tab.getBoundingClientRect();
    if(target.left<edge.left)strip.scrollLeft+=target.left-edge.left;
    else if(target.right>edge.right)strip.scrollLeft+=target.right-edge.right+8;
  }
}
