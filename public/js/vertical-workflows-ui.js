// Trade workflows UI: one saved service report per existing Cerium job.
// Checklists are operational notes, not statutory inspection certificates.
import {VERTICAL_WORKFLOWS,VERTICAL_IDS,verticalProgress,SERVICE_CADENCES} from './vertical-workflows.js';
import {escapeHTML as esc} from './workspace-model.js';
import {businessLocalDate} from './us-market.js';

const option=(value,label,selected)=>'<option value="'+esc(value)+'"'+(value===selected?' selected':'')+'>'+esc(label)+'</option>';
const kinds=Object.entries(VERTICAL_WORKFLOWS);

export function renderVerticalFields(workflow={}){
  const spec=VERTICAL_WORKFLOWS[workflow.industry];
  if(!spec)return '<p class="muted">Choose a trade to capture service details and a quality checklist. General jobs remain unchanged.</p>';
  const values=workflow.values||{},checks=workflow.checks||{};
  return '<div class="vertical-fields">'+
    '<p class="vertical-help">Document the work performed. Mark checklist items Done, Not applicable or To review; these are internal records, not certifications.</p>'+
    '<label>Service type<select data-vertical-service>'+spec.types.map(v=>option(v,v,workflow.serviceType||spec.types[0])).join('')+'</select></label>'+
    '<label>Service cadence (manual plan)<select data-vertical-cadence>'+SERVICE_CADENCES.map(v=>option(v,v,workflow.cadence||'One-time')).join('')+'</select></label>'+ 
    '<label>Next recommended visit<input data-vertical-next type="date" value="'+esc(workflow.nextVisit||'')+'"></label>'+
    spec.fields.map(f=>'<label>'+esc(f.label)+'<input data-vertical-field="'+esc(f.id)+'" maxlength="'+f.max+'" placeholder="'+esc(f.placeholder)+'" value="'+esc(values[f.id]||'')+'"></label>').join('')+
    '<label class="jobs-wide">Work performed / customer handover<textarea data-vertical-notes maxlength="1000" rows="3" placeholder="Work completed, exceptions, recommendations...">'+esc(workflow.workNotes||'')+'</textarea></label>'+
    '<div class="vertical-checks jobs-wide"><h4>Service checklist</h4>'+
    spec.checks.map((item,i)=>'<label class="vertical-check"><span>'+String(i+1)+'. '+esc(item.label)+'</span><select data-vertical-check="'+esc(item.id)+'">'+
      option('todo','To review',checks[item.id]||'todo')+
      option('done','Done',checks[item.id]||'todo')+
      option('na','Not applicable',checks[item.id]||'todo')+
    '</select></label>').join('')+'</div></div>';
}
export function renderVerticalEditor(workflow=null,preferred=''){
  const selected=workflow?.industry||((preferred&&VERTICAL_WORKFLOWS[preferred])?preferred:'');
  const current=workflow||{industry:selected};
  return '<section class="jobs-trade jobs-wide" aria-label="Trade service record">'+
    '<div class="vertical-heading"><h3>Trade service record</h3><p>Trade-specific equipment, site details, checklists and revisit tracking are saved with this job.</p></div>'+
    '<label>Service workflow<select name="verticalIndustry">'+option('','General job — no trade record',selected)+
       kinds.filter(([id])=>id===preferred||id===workflow?.industry).map(([id,s])=>option(id,s.label,selected)).join('')+'</select></label>'+
    '<div data-vertical-fields>'+renderVerticalFields(current)+'</div></section>';
}
export function readVerticalEditor(form){
  const root=form.querySelector('.jobs-trade');
  const industry=root?.querySelector('[name="verticalIndustry"]')?.value||'';
  if(!industry)return null;
  const collect=(selector,attr)=>Object.fromEntries([...root.querySelectorAll(selector)].map(el=>[el.getAttribute(attr),el.value]));
  return {
    industry,
    serviceType:root.querySelector('[data-vertical-service]')?.value||'',
    values:collect('[data-vertical-field]','data-vertical-field'),
    checks:collect('[data-vertical-check]','data-vertical-check'),
    nextVisit:root.querySelector('[data-vertical-next]')?.value||'',
    cadence:root.querySelector('[data-vertical-cadence]')?.value||'One-time',
    workNotes:root.querySelector('[data-vertical-notes]')?.value||''
  };
}
const dateLabel=v=>v||'Not planned';
const dueClass=(date,today)=>!date?'':date<today?' vertical-late':'';
export function renderVerticalWorkflowsPage(ws,readOnly=false,sub='overview'){
  const today=businessLocalDate(ws.account?.timeZone);
  const horizon=new Date(today+'T12:00:00Z');horizon.setUTCDate(horizon.getUTCDate()+30);
  const soon=horizon.toISOString().slice(0,10);
  const all=(ws.jobs||[]).filter(j=>VERTICAL_WORKFLOWS[j.verticalWorkflow?.industry]);
  const scoped=sub==='overview'?all:sub==='revisits'?all.filter(j=>j.verticalWorkflow.nextVisit):all.filter(j=>j.verticalWorkflow.industry===sub);
  const selected=[...scoped].sort((a,b)=>(a.verticalWorkflow.nextVisit||'9999').localeCompare(b.verticalWorkflow.nextVisit||'9999')||b.startAt.localeCompare(a.startAt));
  const needsReview=all.filter(j=>verticalProgress(j.verticalWorkflow).reviewed<verticalProgress(j.verticalWorkflow).total).length;
  const due=all.filter(j=>j.status!=='Cancelled'&&j.verticalWorkflow.nextVisit&&j.verticalWorkflow.nextVisit<=soon).length;
  const stats='<div class="vertical-stats">'+
    '<div class="jobs-stat"><span>Trade service records</span><strong>'+all.length+'</strong><small>Linked to saved jobs</small></div>'+
    '<div class="jobs-stat"><span>Checklists needing review</span><strong>'+needsReview+'</strong><small>Unreviewed steps across jobs</small></div>'+
    '<div class="jobs-stat"><span>Revisits within 30 days</span><strong>'+due+'</strong><small>Based on recommended dates, not bookings</small></div>'+
    '</div>';
  const templates='<section class="vertical-templates">'+kinds.map(([id,s])=>
    '<article class="panel vertical-template"><h2>'+esc(s.label)+'</h2><p>'+s.fields.length+' service data fields · '+s.checks.length+' checklist steps</p>'+
    '<p>'+esc(s.types.join(' · '))+'</p>'+
    '<button type="button" class="button secondary" data-job-action="new" data-job-vertical="'+id+'"'+(readOnly?' disabled':'')+'>+ New '+esc(s.label)+' job</button></article>').join('')+'</section>';
  const list=selected.map(j=>{
    const v=j.verticalWorkflow,p=verticalProgress(v),spec=VERTICAL_WORKFLOWS[v.industry],upcoming=v.nextVisit&&j.status!=='Cancelled';
    return '<article class="vertical-job">'+
      '<div class="vertical-job-main"><span class="vertical-kind">'+esc(spec.label)+'</span><h3>'+esc(j.title)+'</h3>'+
      '<p>'+esc(j.customerName)+' · '+esc(v.serviceType)+' · '+esc(j.status)+'</p>'+
      (v.values.location||v.values.site||v.values.property?'<small>'+esc(v.values.location||v.values.site||v.values.property)+'</small>':'')+'</div>'+
      '<div class="vertical-job-meta"><span>'+p.reviewed+'/'+p.total+' steps reviewed</span><span class="'+(upcoming?dueClass(v.nextVisit,today):'')+'">Next visit: '+esc(dateLabel(v.nextVisit))+'</span></div>'+
      '<div class="vertical-job-actions"><button type="button" class="button secondary" data-job-action="edit" data-job-id="'+esc(j.id)+'"'+(readOnly?' disabled':'')+'>Open report</button>'+
      (upcoming?'<button type="button" class="button secondary" data-job-action="followup" data-job-id="'+esc(j.id)+'"'+(readOnly?' disabled':'')+'>Add follow-up</button>':'')+'</div></article>';
  }).join('');
  return '<div class="jobs vertical-workflows"><div class="page-heading"><div><p class="eyebrow">FIELD SERVICE</p>'+
    '<h1>Trade workflows</h1><p class="page-description">Capture real service details for HVAC, cleaning and landscaping, and see which visits need attention.</p></div></div>'+
    stats+(sub==='overview'?templates:'')+
    '<section class="panel"><div class="jobs-section-head"><h2>'+(
      sub==='revisits'?'Recommended return visits':sub==='overview'?'Service reports':esc(VERTICAL_WORKFLOWS[sub]?.label||'Service reports'))+
    '</h2><span>'+selected.length+' records</span></div><div class="vertical-list">'+
    (list||'<p class="jobs-empty">No trade-specific reports in this view. Use a service workflow when scheduling or editing a job.</p>')+
    '</div></section><p class="vertical-disclaimer">Checklist records are entered by your team. Cerium does not verify inspections, create official compliance certificates or automatically schedule follow-up visits.</p></div>';
}
