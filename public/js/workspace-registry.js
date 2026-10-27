// One registry for category navigation, feature routes, tool visibility and AI links.
// Module IDs stay unchanged so saved preferences and API contracts remain compatible.
import {WORKSPACE_MODULES} from './industry-workspaces.js';
export const WORKSPACE_CATEGORIES=Object.freeze([
  {id:'overview',label:'Overview',icon:'overview'},
  {id:'customers',label:'Customers & Sales',icon:'leads'},
  {id:'field',label:'Field Service',icon:'jobs'},
  {id:'billing',label:'Billing & Payments',icon:'payments'},
  {id:'marketing',label:'Marketing & Reputation',icon:'marketing'},
  {id:'team',label:'Team & Resources',icon:'leads'},
  {id:'insights',label:'Insights & Reports',icon:'reports'},
].map(Object.freeze));
const feature=(id,category,label,section,view='',modules=[])=>Object.freeze({id,category,label,section,view,modules:Object.freeze(modules),href:'#'+(category==='overview'?'overview':category+'/'+id)});
export const WORKSPACE_FEATURES=Object.freeze([
  feature('overview','overview','Overview','overview'),
  feature('leads','customers','Leads','leads','',['leads']),
  feature('followups','customers','Follow-ups','followups','',['followups']),
  feature('quotes','customers','Estimates & Quotes','quotes','',['quotes']),
  feature('schedule','field','Job Schedule','jobs','schedule',['jobs']),
  feature('dispatch','field','Dispatch','jobs','dispatch',['jobs']),
  feature('crew-assignments','field','Crew Assignments','jobs','assignments',['jobs']),
  feature('invoices','billing','Invoices','invoices','',['invoices']),
  feature('payments','billing','Payments','payments','paid',['payments']),
  feature('reminders','billing','Payment Reminders','reminders','',['reminders']),
  feature('bank','billing','Bank Matching','payments','bank',['payments']),
  feature('visibility','marketing','Get Found','marketing','visibility'),
  feature('reengage','marketing','Re-engage','marketing','reengage'),
  feature('reviews','marketing','Reviews','reviews','',['reviews']),
  feature('performance','marketing','Performance','marketing','performance'),
  feature('crew','team','Crew','jobs','crew',['jobs']),
  feature('assignments','team','Assignments','jobs','assignments',['jobs']),
  feature('business','insights','Business Overview','insights','business'),
  feature('sales','insights','Sales Insights','insights','sales',['leads','quotes']),
  feature('revenue','insights','Revenue Insights','insights','revenue',['invoices','payments']),
]);
export const WORKSPACE_UTILITIES=Object.freeze([
  Object.freeze({id:'settings',category:null,label:'Settings',section:'settings',href:'#settings',modules:[]}),
  Object.freeze({id:'customize',category:null,label:'Customize Tools',section:'settings',view:'tools',href:'#settings/tools',modules:[]}),
  Object.freeze({id:'support',category:null,label:'Help & Support',section:'support',href:'#support',modules:[]}),
]);
const routes=[...WORKSPACE_FEATURES,...WORKSPACE_UTILITIES];
const byHash=new Map(routes.map(item=>[item.href.slice(1),item]));
export const LEGACY_WORKSPACE_ROUTES=Object.freeze({
  today:'overview',leads:'customers/leads',followups:'customers/followups',quotes:'customers/quotes',jobs:'field/schedule',
  invoices:'billing/invoices',payments:'billing/payments',bank:'billing/bank',reminders:'billing/reminders',reviews:'marketing/reviews',
  account:'settings',messages:'support',
});
const allModules=WORKSPACE_MODULES.map(x=>x.id);
export function featureEnabled(feature,modules){
  const enabled=Array.isArray(modules)?modules:allModules;
  return !feature.modules?.length||feature.modules.some(id=>enabled.includes(id));
}
export function categoryFeatures(category,modules,activeId=''){
  return WORKSPACE_FEATURES.filter(f=>f.category===category&&(featureEnabled(f,modules)||f.id===activeId));
}
export function categoryDestination(category,modules,lastUsed={}){
  const features=categoryFeatures(category,modules);
  return features.find(f=>f.id===lastUsed[category])||features[0]||WORKSPACE_FEATURES[0];
}
export function resolveWorkspaceRoute(hash,modules,lastUsed={}){
  const key=String(hash||'').replace(/^#/,'');
  if(byHash.has(key))return byHash.get(key);
  if(Object.hasOwn(LEGACY_WORKSPACE_ROUTES,key))return byHash.get(LEGACY_WORKSPACE_ROUTES[key]);
  if(WORKSPACE_CATEGORIES.some(c=>c.id===key))return categoryDestination(key,modules,lastUsed);
  return WORKSPACE_FEATURES[0];
}
export function workspaceRouteKnown(hash){
  const key=String(hash||'').replace(/^#/,'');
  return byHash.has(key)||Object.hasOwn(LEGACY_WORKSPACE_ROUTES,key)||WORKSPACE_CATEGORIES.some(c=>c.id===key);
}
export function workspaceDestination(section){
  return resolveWorkspaceRoute(section==='insights'?'#insights/business':section==='crew'?'#team/crew':section==='dispatch'?'#field/dispatch':'#'+section);
}
export function workspacePathLabel(route){
  const category=WORKSPACE_CATEGORIES.find(c=>c.id===route.category);
  return category&&category.id!=='overview'?category.label+' → '+route.label:route.label;
}
