// Industry-specific workspace identity. Navigation is a view preference, never
// access control. Shared records remain intact when a customer changes trades.
export const BUSINESS_PERSONALIZATIONS=Object.freeze({
  hvac:Object.freeze({
    title:'HVAC Service Center',tagline:'Equipment history, service calls and preventive maintenance in one place.',
    categoryLabels:Object.freeze({customers:'Customers & Service',field:'HVAC Operations',team:'Technicians & Parts'}),
    features:Object.freeze({leads:'Service Enquiries',schedule:'Technician Calendar',dispatch:'Service Calls','crew-assignments':'Technician Assignments','dispatch-planning':'Dispatch Planning','trade-workflows':'Equipment & Maintenance',inventory:'Spare Parts',quotes:'Installation Estimates'}),
    views:Object.freeze([
      {id:'overview',label:'HVAC Desk'},
      {id:'assets',label:'Equipment Register'},
      {id:'maintenance',label:'Maintenance Due'},
      {id:'reports',label:'Service History'},
      {id:'revisits',label:'Return Visits'}
    ]),
    jobLabel:'Service call',createLabel:'Schedule HVAC service'
  }),
  cleaning:Object.freeze({
    title:'Cleaning Operations',tagline:'Property schedules, cleaning quality and repeat-client plans.',
    categoryLabels:Object.freeze({customers:'Clients & Bookings',field:'Cleaning Operations',team:'Cleaners & Supplies'}),
    features:Object.freeze({leads:'Cleaning Enquiries',schedule:'Cleaning Calendar',dispatch:'Cleaning Visits','crew-assignments':'Cleaner Assignments','dispatch-planning':'Team Scheduling','trade-workflows':'Properties & Quality',inventory:'Cleaning Supplies',quotes:'Cleaning Estimates'}),
    views:Object.freeze([
      {id:'overview',label:'Cleaning Desk'},
      {id:'properties',label:'Client Properties'},
      {id:'quality',label:'Quality Checks'},
      {id:'plans',label:'Service Plans'},
      {id:'revisits',label:'Repeat Visits'}
    ]),
    jobLabel:'Cleaning visit',createLabel:'Book cleaning visit'
  }),
  landscaping:Object.freeze({
    title:'Landscape Operations',tagline:'Site care, irrigation, seasonal work and the next property visit.',
    categoryLabels:Object.freeze({customers:'Customers & Properties',field:'Landscape Operations',team:'Crews & Materials'}),
    features:Object.freeze({leads:'Property Enquiries',schedule:'Site Calendar',dispatch:'Crew Visits','crew-assignments':'Crew Workload','dispatch-planning':'Crew Planning','trade-workflows':'Property Care',inventory:'Materials & Stock',quotes:'Landscape Estimates'}),
    views:Object.freeze([
      {id:'overview',label:'Landscape Desk'},
      {id:'properties',label:'Property Register'},
      {id:'irrigation',label:'Irrigation Work'},
      {id:'seasonal',label:'Seasonal Care'},
      {id:'revisits',label:'Return Visits'}
    ]),
    jobLabel:'Site visit',createLabel:'Schedule site visit'
  })
});
export function activeBusinessPersonalization(workspace){
  return BUSINESS_PERSONALIZATIONS[workspace?.account?.workspacePreferences?.category]||null;
}
export function activeBusinessId(workspace){
  const id=workspace?.account?.workspacePreferences?.category;
  return BUSINESS_PERSONALIZATIONS[id]?id:null;
}
export function businessCategoryLabel(category,workspace){
  return activeBusinessPersonalization(workspace)?.categoryLabels[category]||null;
}
export function businessFeatureLabel(feature,workspace){
  return activeBusinessPersonalization(workspace)?.features[feature]||null;
}
export function activeBusinessViews(route,workspace){
  if(route?.id!=='trade-workflows')return null;
  return activeBusinessPersonalization(workspace)?.views||[];
}
export function businessFeatureVisible(feature,workspace){
  if(feature.id!=='trade-workflows')return true;
  return Boolean(activeBusinessId(workspace));
}
