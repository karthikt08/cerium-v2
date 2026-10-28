// Trusted destinations for Cerium Guide. Model text never controls a URL.
// Hashes below must map to an actual page (or a Marketing tab) in this app.
import {GUIDE_SECTIONS} from './guide-knowledge.js';
import {MARKETING_FEATURE_TABS} from './marketing-features.js';

import {WORKSPACE_FEATURES,WORKSPACE_UTILITIES,LEGACY_WORKSPACE_ROUTES,workspaceDestination,workspacePathLabel} from './workspace-registry.js';
const asLink=route=>({href:route.href,label:workspacePathLabel(route)});
const PAGES=Object.fromEntries(GUIDE_SECTIONS.map(section=>[section,asLink(workspaceDestination(section))]));
const HASHES=new Map([...WORKSPACE_FEATURES,...WORKSPACE_UTILITIES].map(route=>[route.href,asLink(route)]));
for(const alias of Object.keys(LEGACY_WORKSPACE_ROUTES))HASHES.set('#'+alias,asLink(workspaceDestination(alias)));
for(const section of GUIDE_SECTIONS)HASHES.set('#'+section,PAGES[section]);
export function trustedGuideLink(href){
  return HASHES.get(String(href||''))||null;
}
export function guideNavigationLinks(result,question=''){
  if(!result||typeof result!=='object')return [];
  const query=String(question||'').toLocaleLowerCase().slice(0,420);
  const links=[],seen=new Set();
  const add=href=>{
    const safe=trustedGuideLink(href);
    if(!safe||seen.has(safe.href)||links.length>=5)return;
    seen.add(safe.href);
    links.push({...safe});
  };
  // Read-only Copilot answers supply only destinations that this registry trusts.
  if(result.type==='copilot'&&['copilot','llm'].includes(result.source)){
    for(const href of Array.isArray(result.destinations)?result.destinations:[])add(href);
    return links;
  }
  // Unknown/social turns must not get random navigation destinations.
  if(result.type==='conversation'&&!GUIDE_SECTIONS.includes(result.section))return [];
  if(result.source==='navlm'&&result.matched===false)return [];
  if(result.type==='tool_recommendations'){
    for(const suggestion of Array.isArray(result.recommendations)?result.recommendations.slice(0,3):[]){
      if(suggestion&&GUIDE_SECTIONS.includes(suggestion.id))add(PAGES[suggestion.id]?.href);
    }
    if(result.recommendations?.length)add('#settings');
    return links;
  }
  if(result.type==='workflow'&&Array.isArray(result.actions)){
    for(const action of result.actions)if(GUIDE_SECTIONS.includes(action?.section))add(PAGES[action.section].href);
    return links;
  }
  if(!GUIDE_SECTIONS.includes(result.section))return [];
  // Marketing deep links are drawn from the same checked feature registry as the tabs.
  if(result.section==='marketing'){
    if(/\b(?:re.?book|re.?engag|returning|repeat customers?|retention|past customers?|win.?back)\b/.test(query)){
      add('#marketing/reengage');
      add('#followups');
    }else if(/\b(?:track|performance|analytics|measure|results|sources?|conversions?|metrics?|report)\b/.test(query)){
      add('#marketing/performance');
      add('#leads');
    }else if(/\b(?:review|visibility|social|post|promot|discover|found|google)\b/.test(query)){
      add('#marketing/visibility');
      add('#reviews');
    }else{
      for(const feature of MARKETING_FEATURE_TABS.slice(0,5))add('#marketing/'+feature.key);
    }
    return links;
  }
  if(result.section==='payments'&&/\b(?:bank|match|deposit|reconcil)/.test(query))add('#billing/bank');
  else if(result.section==='jobs'&&/\b(?:crew|team|staff|technician)\b/.test(query)&&!/\b(?:schedule|assign|dispatch|job|appointment)\b/.test(query))add('#team/crew');
  else if(result.section==='jobs'&&/\bdispatch\b/.test(query))add('#field/dispatch');
  else if(result.section==='insights'&&/\b(?:sales|leads?|conversion|sources?)\b/.test(query))add('#insights/sales');
  else if(result.section==='insights'&&/\b(?:revenue|payment|invoice|overdue|financial)\b/.test(query))add('#insights/revenue');
  else if(result.section==='settings'&&/customi[sz]|hide tool|show tool/.test(query))add('#settings/tools');
  else add(PAGES[result.section].href);
  if(result.section==='reviews'&&/\b(?:marketing|promot|get found)\b/.test(query))add('#marketing/visibility');
  if(result.section==='followups'&&/\b(?:re.?book|re.?engag|former|past customers?|marketing)\b/.test(query))
    add('#marketing/reengage');
  if(result.section==='leads'&&/\b(?:source|analytics|marketing|performance)\b/.test(query))
    add('#marketing/performance');
  if(result.section==='invoices'&&/\b(?:late|overdue|unpaid|chase|remind)\b/.test(query))add('#reminders');
  return links;
}
