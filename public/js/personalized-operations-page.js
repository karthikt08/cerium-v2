// Personalized operating centers built from actual, owner-scoped Cerium jobs.
// No speculative contracts, auto-scheduling or fabricated asset readings.
import {VERTICAL_WORKFLOWS,verticalProgress} from './vertical-workflows.js';
import {activeBusinessId,activeBusinessPersonalization} from './business-personalization.js';
import {businessLocalDate} from './us-market.js';
import {escapeHTML as esc} from './workspace-model.js';

const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s);
const day=s=>String(s||'').slice(0,10);
const statusOpen=j=>!['Cancelled','Completed'].includes(j.status);
const button=(label,action,extra='')=>'<button type="button" class="button secondary" data-job-action="'+action+'" '+extra+'>'+esc(label)+'</button>';
const openReport=j=>button('Open '+(j.status==='Completed'?'report':'job'),'edit','data-job-id="'+esc(j.id)+'"');
const str=v=>String(v||'').trim();
const sortByDate=(jobs,key)=>[...jobs].sort((a,b)=>str(key(a)).localeCompare(str(key(b))));
const count=(text,value,hint)=>'<div class="jobs-stat"><span>'+esc(text)+'</span><strong>'+value+'</strong><small>'+esc(hint)+'</small></div>';
const link=(href,label)=>'<a class="button secondary" href="'+href+'" data-nav="'+href.slice(1)+'">'+esc(label)+'</a>';
const row=(j,today)=>{
  const v=j.verticalWorkflow,progress=verticalProgress(v),next=v.nextVisit;
  return '<article class="vertical-job"><div class="vertical-job-main">'+
    '<span class="vertical-kind">'+esc(v.serviceType)+'</span><h3>'+esc(j.title)+'</h3>'+
    '<p>'+esc(j.customerName)+' · '+esc(j.status)+' · '+esc(day(j.startAt))+'</p>'+
    (j.address?'<small>'+esc(j.address)+'</small>':'')+
    '</div><div class="vertical-job-meta"><span>'+progress.reviewed+'/'+progress.total+' checklist steps reviewed</span>'+
    '<span class="'+(next&&next<today?'vertical-late':'')+'">'+(next?'Next visit: '+esc(next):'No revisit scheduled')+'</span>'+
    (v.cadence&&v.cadence!=='One-time'?'<span>'+esc(v.cadence)+' service plan</span>':'')+
    '</div><div class="vertical-job-actions">'+openReport(j)+
    (next&&j.status!=='Cancelled'?button('Create follow-up','followup','data-job-id="'+esc(j.id)+'"'):'')+
    '</div></article>';
};
const jobList=(items,today,empty)=>'<div class="vertical-list">'+(items.length?items.map(j=>row(j,today)).join(''):
  '<p class="jobs-empty">'+esc(empty)+'</p>')+'</div>';
const panel=(title,detail,body)=>'<section class="panel vertical-business-panel"><div class="jobs-section-head"><div><h2>'+esc(title)+'</h2><p class="muted">'+esc(detail)+'</p></div></div>'+body+'</section>';
const taskCards=(id,readOnly)=>'<div class="vertical-business-presets">'+VERTICAL_WORKFLOWS[id].types.map(service=>
  '<button type="button" class="vertical-preset" data-job-action="new" data-job-vertical="'+id+'" data-job-service-type="'+esc(service)+'"'+(readOnly?' disabled':'')+'>'+
    '<span>'+esc(service)+'</span><span aria-hidden="true">+</span></button>').join('')+'</div>';
function siteGroups(jobs,id){
  const groups=new Map();
  for(const j of jobs){
    const v=j.verticalWorkflow,location=id==='hvac'?(v.values.serial||v.values.makeModel||''):(j.address||v.values.property||v.values.site||'');
    if(!location)continue;
    // Group within the same customer, never across unrelated owners.
    const key=str(j.customerName).toLowerCase()+'::'+str(location).toLowerCase();
    if(!groups.has(key))groups.set(key,{name:location,customer:j.customerName,jobs:[]});
    groups.get(key).jobs.push(j);
  }
  return [...groups.values()].sort((a,b)=>a.customer.localeCompare(b.customer)||a.name.localeCompare(b.name));
}
function groupPanel(groups,id,today){
  const noun=id==='hvac'?'Equipment':'Property';
  const contents=groups.map(g=>{
    const ordered=[...g.jobs].sort((a,b)=>b.startAt.localeCompare(a.startAt));
    const next=ordered.map(j=>j.verticalWorkflow.nextVisit).filter(Boolean).sort()[0];
    return '<article class="vertical-site"><div><span class="vertical-kind">'+esc(noun)+'</span><h3>'+esc(g.name)+'</h3>'+
      '<p>'+esc(g.customer)+' · '+g.jobs.length+' service '+(g.jobs.length===1?'record':'records')+'</p>'+
      '<small>Last recorded visit: '+esc(day(ordered[0].startAt))+(next?' · Recommended next: '+esc(next):'')+'</small></div>'+
      '<div class="vertical-job-actions">'+openReport(ordered[0])+'</div></article>';
  }).join('');
  return panel(id==='hvac'?'Equipment with recorded service history':'Customer properties with recorded visits',
    'Compiled from your saved service jobs; no independent asset or property record is invented.',
    '<div class="vertical-list">'+(contents||'<p class="jobs-empty">Add an address or equipment ID on a service job to build this register.</p>')+'</div>');
}
export function personalizedBusinessSnapshot(ws){
  const id=activeBusinessId(ws),spec=activeBusinessPersonalization(ws);
  if(!id)return null;
  const today=businessLocalDate(ws.account?.timeZone);
  const jobs=(ws.jobs||[]).filter(j=>j.verticalWorkflow?.industry===id);
  const pending=jobs.filter(j=>verticalProgress(j.verticalWorkflow).reviewed<verticalProgress(j.verticalWorkflow).total&&j.status!=='Cancelled');
  const due=jobs.filter(j=>j.verticalWorkflow.nextVisit&&j.verticalWorkflow.nextVisit<=today&&j.status!=='Cancelled');
  const activeToday=jobs.filter(j=>day(j.startAt)===today&&statusOpen(j));
  const sites=siteGroups(jobs,id);
  return {id,spec,today,jobs,pending,due,activeToday,sites};
}
export function renderPersonalizedOverview(ws){
  const data=personalizedBusinessSnapshot(ws);
  if(!data){
    const spec=activeBusinessPersonalization(ws);
    if(!spec)return '';
    // The seven shared-tool verticals still have a personalized home using real
    // record totals. They are not advertised as full trade-specific products.
    const enabled=new Set(ws.account.workspacePreferences?.modules||[]);
    const links=[
      {id:'leads',href:'#customers/leads',label:spec.features.leads||'Customer enquiries'},
      {id:'quotes',href:'#customers/quotes',label:spec.features.quotes||'Estimates'},
      {id:'jobs',href:'#field/schedule',label:spec.features.schedule||'Job schedule'},
      {id:'followups',href:'#customers/followups',label:'Follow-ups'},
      {id:'invoices',href:'#billing/invoices',label:'Invoices'}
    ].filter(item=>enabled.has(item.id));
    const openJobs=(ws.jobs||[]).filter(statusOpen).length;
    const liveLeads=(ws.leads||[]).filter(l=>['New','Quoted'].includes(l.stage)).length;
    const pendingQuotes=(ws.quotes||[]).filter(q=>['Draft','Sent'].includes(q.status)).length;
    return '<section class="vertical-home-snapshot" aria-label="'+esc(spec.title)+' workspace">'+
      '<div class="vertical-home-header"><div><p class="eyebrow">YOUR BUSINESS · '+esc(spec.title.toUpperCase())+'</p>'+
      '<h2>'+esc(spec.title)+'</h2><p>'+esc(spec.tagline)+'</p></div>'+
      link('#settings/tools','Personalize my tools')+'</div>'+
      '<div class="vertical-home-metrics">'+count('Active work',openJobs,'Recorded scheduled jobs')+
      count('Open enquiries',liveLeads,'New and quoted leads')+
      count('Quotes in progress',pendingQuotes,'Draft or sent estimates')+'</div>'+
      '<div class="vertical-home-links">'+links.map(item=>link(item.href,item.label)).join('')+'</div></section>';
  }
  const {id,spec,jobs,pending,due,activeToday,sites}=data;
  const labels=id==='hvac'?['Service calls today','Equipment tracked','Maintenance callbacks due']:
    id==='cleaning'?['Cleaning visits today','Properties tracked','Quality reviews pending']:
    ['Site visits today','Sites tracked','Return visits due'];
  const third=id==='cleaning'?pending.length:due.length;
  return '<section class="vertical-home-snapshot" aria-label="'+esc(spec.title)+' snapshot">'+
    '<div class="vertical-home-header"><div><p class="eyebrow">YOUR BUSINESS · '+esc(spec.title.toUpperCase())+'</p>'+
    '<h2>'+esc(spec.title)+'</h2><p>'+esc(spec.tagline)+'</p></div>'+
    link('#field/trade-workflows','Open my operations')+'</div>'+
    '<div class="vertical-home-metrics">'+
    count(labels[0],activeToday.length,'Recorded appointments today')+
    count(labels[1],sites.length,'From saved service records')+
    count(labels[2],third,id==='cleaning'?'Checklist steps still to review':'Recommended dates now due')+'</div>'+
    '<div class="vertical-home-links">'+
    link('#field/schedule',id==='hvac'?'Technician calendar':id==='cleaning'?'Cleaning calendar':'Site calendar')+
    link('#field/trade-workflows/'+(id==='hvac'?'assets':'properties'),id==='hvac'?'Equipment history':'Customer properties')+
    link('#field/trade-workflows/revisits','Upcoming return visits')+'</div></section>';
}
export function renderPersonalizedOperationsPage(ws,readOnly=false,sub='overview'){
  const data=personalizedBusinessSnapshot(ws);
  if(!data)return '<div class="jobs vertical-workflows"><div class="page-heading"><div><h1>Business operations</h1><p class="page-description">Choose your business type in Customize Tools to activate a tailored operating center. Your existing jobs and reports remain available in the Job Schedule.</p></div></div>'+link('#settings/tools','Choose business type')+'</div>';
  const {id,spec,today,jobs,pending,due,activeToday,sites}=data;
  const views=new Set(spec.views.map(v=>v.id)),view=views.has(sub)?sub:'overview';
  const horizon=new Date(today+'T12:00:00Z');horizon.setUTCDate(horizon.getUTCDate()+30);
  const soon=horizon.toISOString().slice(0,10);
  const revisitJobs=sortByDate(jobs.filter(j=>j.status!=='Cancelled'&&j.verticalWorkflow.nextVisit),j=>j.verticalWorkflow.nextVisit);
  const activeSoon=revisitJobs.filter(j=>j.verticalWorkflow.nextVisit<=soon);
  const rows=(title,help,items,empty)=>panel(title,help,jobList(items,today,empty));
  let body='';
  if(view==='overview'){
    const upcoming=jobs.filter(j=>statusOpen(j)&&day(j.startAt)>=today).sort((a,b)=>a.startAt.localeCompare(b.startAt)).slice(0,8);
    body='<section class="vertical-home-actions"><div><h2>Start work</h2><p>Choose a service type. Cerium opens a real job and service report, with your business fields preselected.</p></div>'+
      taskCards(id,readOnly)+'</section>'+
      rows('Your upcoming '+(id==='hvac'?'service calls':id==='cleaning'?'cleaning visits':'site visits'),'Jobs already scheduled in your business workspace.',upcoming,'No upcoming jobs. Choose a service type to schedule one.')+
      rows(id==='hvac'?'Maintenance needing attention':id==='cleaning'?'Quality reviews needing attention':'Field checks needing attention','Unreviewed checklist items on saved service jobs.',pending.slice(0,7),'Every recorded checklist has been reviewed.');
  }else if(view==='assets'||view==='properties'){
    body=groupPanel(sites,id,today);
  }else if(view==='maintenance'){
    body=rows('Preventive maintenance queue','Recommended follow-up dates within 30 days. These are not automatically booked.',activeSoon,'No equipment maintenance dates in the next 30 days.');
  }else if(view==='reports'){
    body=rows('Completed HVAC service history','Service observations saved with completed jobs.',jobs.filter(j=>j.status==='Completed').sort((a,b)=>b.startAt.localeCompare(a.startAt)),'No completed service reports yet.');
  }else if(view==='quality'){
    body=rows('Cleaning quality checks','Jobs with at least one checklist step not yet reviewed.',pending,'No quality checklists awaiting review.');
  }else if(view==='plans'){
    body=rows('Repeat-client cleaning plans','Service cadence is recorded on each job. Return visits are not booked automatically.',jobs.filter(j=>j.verticalWorkflow.cadence&&j.verticalWorkflow.cadence!=='One-time'), 'No repeat service plans. Add a cadence and recommended next visit in a cleaning job.');
  }else if(view==='irrigation'){
    body=rows('Irrigation work','Site visits marked as irrigation service or containing irrigation observations.',jobs.filter(j=>/irrigation/i.test(j.verticalWorkflow.serviceType)||str(j.verticalWorkflow.values.irrigation)),'No irrigation jobs have been recorded.');
  }else if(view==='seasonal'){
    body=rows('Seasonal property care','Lawn, planting and scheduled recurring grounds work.',jobs.filter(j=>/lawn|plant|bed/i.test(j.verticalWorkflow.serviceType)||j.verticalWorkflow.cadence&&j.verticalWorkflow.cadence!=='One-time'), 'No lawn or seasonal-care service records yet.');
  }else if(view==='revisits'){
    body=rows('Recommended return visits','An action due date is separate from a scheduled appointment; review and create a follow-up explicitly.',revisitJobs,'No future or overdue recommended visits recorded.');
  }
  return '<div class="jobs vertical-workflows vertical-personalized" data-business="'+id+'">'+
    '<div class="page-heading"><div><p class="eyebrow">YOUR BUSINESS · '+esc(spec.title.toUpperCase())+'</p>'+
    '<h1>'+esc(spec.title)+'</h1><p class="page-description">'+esc(spec.tagline)+'</p></div>'+
    '<div class="heading-actions"><button class="button primary" type="button" data-job-action="new" data-job-vertical="'+id+'"'+(readOnly?' disabled':'')+'>'+esc(spec.createLabel)+'</button></div></div>'+
    '<div class="vertical-stats">'+
    count('Service records',jobs.length,'For your selected business')+
    count('Checklists to review',pending.length,'Recorded work needing attention')+
    count('Revisits due',due.length,'Recommended dates through today')+'</div>'+
    body+'<p class="vertical-disclaimer">Registers are derived from your saved jobs. Recurring service cadence and revisit dates are manual records, not auto-scheduled appointments. Internal checklists are not compliance certificates.</p></div>';
}
