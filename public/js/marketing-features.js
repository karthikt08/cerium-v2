// Marketing's panels are a projection of the shared workspace registry.
import {WORKSPACE_FEATURES} from './workspace-registry.js';
export const MARKETING_FEATURE_TABS=Object.freeze(WORKSPACE_FEATURES.filter(f=>f.section==='marketing').map(f=>Object.freeze({key:f.id,label:f.label})));
export function marketingFeatureFromHash(hash){
  const found=/^#?marketing\/([a-z][a-z0-9-]{0,31})$/.exec(String(hash||''));
  if(!found)return null;
  return MARKETING_FEATURE_TABS.some(tab=>tab.key===found[1])?found[1]:null;
}
