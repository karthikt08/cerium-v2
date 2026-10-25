// Shared, privacy-friendly CERIUM industry presets. These are VIEW preferences,
// not authorization rules: hiding a module must never hide or destroy its data.
export const WORKSPACE_MODULES=Object.freeze([
  {id:'jobs',label:'Jobs & scheduling'},
  {id:'leads',label:'Leads'},
  {id:'quotes',label:'Estimates & quotes'},
  {id:'followups',label:'Customer follow-ups'},
  {id:'invoices',label:'Invoices'},
  {id:'payments',label:'Payments'},
  {id:'reminders',label:'Payment reminders'},
  {id:'reviews',label:'Customer reviews'}
]);
const ids=WORKSPACE_MODULES.map(m=>m.id);
const preset=(id,label,modules,keywords)=>({id,label,modules:Object.freeze(modules.split(' ')),keywords});
export const INDUSTRY_PROFILES=Object.freeze([
  preset('construction','Construction & renovation','jobs quotes invoices payments leads followups',/construct|building|renovat|civil|general contractor|remodel|site work/i),
  preset('plumbing','Plumbing','jobs quotes invoices payments followups reviews',/plumb|pipe|drain|water heater/i),
  preset('electrical','Electrical services','jobs quotes invoices payments reviews leads',/electric|wiring|switchboard|panel install/i),
  preset('hvac','HVAC & refrigeration','jobs quotes invoices payments followups reminders',/hvac|heating|ventilat|air.?condition|refrigerat|ac repair/i),
  preset('cleaning','Cleaning & maintenance','jobs invoices payments reviews followups',/clean|janitor|housekeep|maid|maintenance service/i),
  preset('landscaping','Landscaping & gardening','jobs quotes invoices payments leads reviews',/landscap|garden|lawn|irrigat|yard care/i),
  preset('roofing','Roofing','jobs quotes invoices payments leads followups',/roof|shingle|gutter/i),
  preset('painting','Painting & finishing','quotes jobs invoices payments leads reviews',/paint|decorat|wall finish|coating/i),
  preset('handyman','Handyman & home repair','jobs quotes invoices payments reviews leads',/handyman|handy.?person|home repair|odd job|carpentr|furniture repair/i),
  preset('consulting','Consulting & freelance','leads quotes followups invoices payments reminders',/consult|freelanc|design service|agency|coaching|professional service/i),
]);
export const INDUSTRY_OPTIONS=Object.freeze([...INDUSTRY_PROFILES.map(p=>({value:p.id,label:p.label})),{value:'other',label:'Other — choose my tools'}]);
const byId=new Map(INDUSTRY_PROFILES.map(p=>[p.id,p]));
export const isIndustry=value=>value==='other'||byId.has(value);
export function suggestIndustry(description=''){
  const input=String(description||'').slice(0,500);
  const match=INDUSTRY_PROFILES.find(p=>p.keywords.test(input));
  return match?{category:match.id,reason:'Matched your description to '+match.label+'.'}:
    {category:'other',reason:'No single industry matched. Choose the tools that fit your daily work.'};
}
export function defaultModules(category='other'){
  return [...(byId.get(category)?.modules||ids)];
}
export function normalizeModules(value,{allowEmpty=false}={}){
  const input=typeof value==='string'?value.split(',').filter(Boolean):value;
  if(!Array.isArray(input)||(!allowEmpty&&input.length===0)||input.length>ids.length ||
    input.some(x=>typeof x!=='string'||!ids.includes(x))||new Set(input).size!==input.length)
    throw new Error('Choose at least one valid CERIUM module without duplicates.');
  return [...input];
}
// Lightweight explainable recommendations. No model API or network calls.
// Only the text typed into the current browser is inspected.
const signals=[
  {terms:/schedul|appointment|project|dispatch|site visit|task|service call|crew|job/i,modules:['jobs']},
  {terms:/new client|lead|prospect|inquir|sales|customer acquis/i,modules:['leads']},
  {terms:/quote|estimate|proposal|bid|pricing project/i,modules:['quotes']},
  {terms:/follow.?up|callback|check.?in|reach out|contact client/i,modules:['followups']},
  {terms:/invoice|bill client|charge client|receivable/i,modules:['invoices']},
  {terms:/payment|paid|collection|deposit|cash flow|receiv/i,modules:['payments']},
  {terms:/overdue|remind|late payment|chase payment/i,modules:['reminders']},
  {terms:/review|rating|testimonial|reputation|feedback/i,modules:['reviews']},
];
export function recommendWorkspace({category='other',description='',trade=''}={}){
  const input=(String(description||'')+' '+String(trade||'')).slice(0,600);
  const inferred=suggestIndustry(input);
  const selected=new Set(category==='other'?[]:defaultModules(category));
  const reasons=[];
  for(const signal of signals){
    if(signal.terms.test(input)){
      signal.modules.forEach(key=>selected.add(key));
      reasons.push(...signal.modules);
    }
  }
  if(category==='other'&&selected.size===0) {
    ['jobs','invoices','payments'].forEach(k=>selected.add(k));
    reasons.push('jobs','invoices','payments');
  }
  const modules=ids.filter(id=>selected.has(id));
  return {modules,category:category==='other'?inferred.category:category,
    explanation:reasons.length?'Suggested from the work you described: '+[...new Set(reasons)].map(id=>WORKSPACE_MODULES.find(m=>m.id===id)?.label).filter(Boolean).join(', ')+'.':
    'Suggested based on the selected business category. Every module can be changed later.'};
}
