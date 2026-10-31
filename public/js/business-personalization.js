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
// Seven additional official business types also get their own terminology and
// working navigation. They retain existing tools until a deep vertical is built.
const BASIC_PERSONALIZATIONS=Object.freeze({
  construction:{title:'Construction Projects',tagline:'Project enquiries, site work, estimates and billing.',categoryLabels:{customers:'Clients & Bids',field:'Project Operations',team:'Crews & Materials'},features:{leads:'Project Enquiries',quotes:'Project Estimates',schedule:'Site Schedule',dispatch:'Site Visits','crew-assignments':'Crew Allocation',inventory:'Materials'},jobLabel:'Site job',createLabel:'Schedule site work'},
  plumbing:{title:'Plumbing Service Desk',tagline:'Call-outs, installations, repair appointments and customer billing.',categoryLabels:{customers:'Service Customers',field:'Plumbing Operations',team:'Plumbers & Stock'},features:{leads:'Repair Enquiries',quotes:'Repair Estimates',schedule:'Call-out Calendar',dispatch:'Plumbing Call-outs',inventory:'Parts & Supplies'},jobLabel:'Service call',createLabel:'Schedule plumbing call'},
  electrical:{title:'Electrical Service Desk',tagline:'Inspection appointments, installations, estimates and technicians.',categoryLabels:{customers:'Clients & Estimates',field:'Electrical Operations',team:'Electricians & Stock'},features:{leads:'Installation Enquiries',quotes:'Installation Estimates',schedule:'Electrician Calendar',dispatch:'Electrical Jobs',inventory:'Parts Inventory'},jobLabel:'Electrical job',createLabel:'Schedule electrical job'},
  roofing:{title:'Roofing Projects',tagline:'Roof inspections, replacement enquiries, estimates and field work.',categoryLabels:{customers:'Roofing Enquiries',field:'Roofing Operations',team:'Roofing Crews & Stock'},features:{leads:'Roof Enquiries',quotes:'Roof Estimates',schedule:'Roofing Schedule',dispatch:'Roofing Jobs',inventory:'Roofing Materials'},jobLabel:'Roofing job',createLabel:'Schedule roof work'},
  painting:{title:'Painting Projects',tagline:'Walk-throughs, estimates, painting crews and customer handover.',categoryLabels:{customers:'Painting Clients',field:'Painting Operations',team:'Painters & Materials'},features:{leads:'Painting Enquiries',quotes:'Painting Quotes',schedule:'Painting Schedule',dispatch:'Painting Jobs',inventory:'Paint & Supplies'},jobLabel:'Painting job',createLabel:'Schedule painting work'},
  handyman:{title:'Home Repair Desk',tagline:'Small repair requests, customer appointments and completed work.',categoryLabels:{customers:'Repair Customers',field:'Home Repair Operations',team:'Handymen & Tools'},features:{leads:'Repair Enquiries',quotes:'Repair Estimates',schedule:'Repair Calendar',dispatch:'Home Repairs',inventory:'Parts & Tools'},jobLabel:'Repair visit',createLabel:'Schedule repair visit'},
  consulting:{title:'Consulting Engagements',tagline:'Prospects, proposals, client follow-ups and milestone invoices.',categoryLabels:{customers:'Clients & Proposals',field:'Engagement Work',team:'Team & Resources'},features:{leads:'Prospective Clients',quotes:'Client Proposals',schedule:'Engagement Calendar',dispatch:'Client Work'},jobLabel:'Client engagement',createLabel:'Schedule client work'}
});
export const INDUSTRY_WORKSPACE_PERSONALIZATIONS=Object.freeze({...BASIC_PERSONALIZATIONS,...BUSINESS_PERSONALIZATIONS});
export function activeBusinessPersonalization(workspace){
  return INDUSTRY_WORKSPACE_PERSONALIZATIONS[workspace?.account?.workspacePreferences?.category]||null;
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
  if(feature.id!=='trade-workflows'||!workspace)return true;
  return Boolean(activeBusinessId(workspace));
}

export function businessSelectionDescription(category){
  const profile=INDUSTRY_WORKSPACE_PERSONALIZATIONS[category];
  if(!profile)return 'Choose your tools freely. Cerium keeps the standard configurable workspace.';
  const depth=BUSINESS_PERSONALIZATIONS[category]?' Dedicated records, service checklists and business-specific work queues are included.':' Your existing Cerium tools will use terminology for this business.';
  return profile.title+' — '+profile.tagline+depth;
}
