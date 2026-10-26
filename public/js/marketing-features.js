// The one approved registry for Marketing feature tabs, routing, and AI links.
// Add future tabs here, then provide a matching data-marketing-panel in the UI.
// Keys are intentionally constrained: unknown hashes are never enabled.
export const MARKETING_FEATURE_TABS=Object.freeze([
  Object.freeze({key:'visibility',label:'Get found and chosen'}),
  Object.freeze({key:'reengage',label:'Re-book and re-engage'}),
  Object.freeze({key:'performance',label:'Track performance'})
]);
export function marketingFeatureFromHash(hash){
  const found=/^#?marketing\/([a-z][a-z0-9-]{0,31})$/.exec(String(hash||''));
  if(!found)return null;
  return MARKETING_FEATURE_TABS.some(tab=>tab.key===found[1])?found[1]:null;
}
