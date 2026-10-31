// Trade-specific service records. Shared by the browser and the server so
// labels, field limits, allowed values and checklist steps cannot drift.
const field=(id,label,placeholder='',max=160)=>Object.freeze({id,label,placeholder,max});
const step=(id,label)=>Object.freeze({id,label});
export const VERTICAL_WORKFLOWS=Object.freeze({
  hvac:Object.freeze({
    label:'HVAC & refrigeration',
    types:['Diagnostic / repair','Preventive maintenance','Installation / replacement','Return visit'],
    fields:Object.freeze([
      field('equipment','Equipment / unit type','Split AC, heat pump, walk-in cooler'),
      field('makeModel','Make & model','Manufacturer and model'),
      field('serial','Serial / asset tag','Identifier on customer equipment'),
      field('location','Equipment location','Roof, kitchen, unit 2'),
      field('filter','Filter size / condition','Size, last replaced'),
      field('readings','Recorded operating readings','Supply / return readings, units'),
      field('fault','Reported fault / diagnosis','Symptoms and technician findings',350)
    ]),
    checks:Object.freeze([
      step('site','Confirm service scope and equipment identity'),
      step('isolation','Record electrical isolation / safe access assessment'),
      step('filters','Inspect filters and airflow'),
      step('coil','Inspect coils and ventilation paths'),
      step('drain','Check condensate drainage where applicable'),
      step('controls','Inspect thermostat / controls'),
      step('operation','Record post-service operation checks'),
      step('handover','Explain findings and recommended next steps')
    ])
  }),
  cleaning:Object.freeze({
    label:'Cleaning & maintenance',
    types:['Routine home clean','Deep clean','Move-in / move-out','Commercial contract','Return visit'],
    fields:Object.freeze([
      field('property','Property / site type','Apartment, office, retail unit'),
      field('rooms','Rooms / zones','2 bed, 2 bath, kitchen'),
      field('scope','Agreed service scope','Areas and exclusions',350),
      field('priority','Priority areas','Kitchen grease, reception'),
      field('surfaces','Sensitive surfaces / restrictions','Stone, wood, no bleach'),
      field('supplies','Supplies and equipment','Client-supplied or crew-supplied'),
      field('issues','Damage / issues reported','Existing damage or exceptions',350)
    ]),
    checks:Object.freeze([
      step('scope','Confirm rooms, access and agreed scope'),
      step('safety','Check site hazards and surface restrictions'),
      step('surfaces','Clean reachable surfaces and touch points'),
      step('kitchen','Complete kitchen tasks or mark not applicable'),
      step('washrooms','Complete washrooms or mark not applicable'),
      step('floors','Vacuum / mop / finish agreed floors'),
      step('waste','Remove waste and pack equipment'),
      step('inspection','Record final quality walk-through'),
      step('handover','Report exceptions and customer handover')
    ])
  }),
  landscaping:Object.freeze({
    label:'Landscaping & lawn care',
    types:['Routine lawn care','Planting / bed maintenance','Irrigation service','Garden redesign / install','Return visit'],
    fields:Object.freeze([
      field('site','Site / property zone','Front yard, west beds'),
      field('area','Area / dimensions','Lawn area and unit, if measured'),
      field('tasks','Work scope','Mowing, edging, mulch',350),
      field('irrigation','Irrigation zones / status','Zones tested, observed leaks'),
      field('plantings','Plants / material notes','Species, quantities, condition'),
      field('weather','Weather / ground conditions','Rain delay, wet ground'),
      field('disposal','Clippings and waste plan','Onsite compost or removal')
    ]),
    checks:Object.freeze([
      step('hazards','Review site hazards and underground utilities'),
      step('scope','Confirm service boundaries and customer requests'),
      step('equipment','Inspect equipment before work'),
      step('mow','Mow / edge lawn or mark not applicable'),
      step('beds','Weed / maintain beds or mark not applicable'),
      step('water','Check irrigation / water issues where applicable'),
      step('cleanup','Clear debris and remove waste as agreed'),
      step('inspection','Walk site and document exceptions'),
      step('handover','Record recommendations and customer handover')
    ])
  })
});
export const VERTICAL_IDS=Object.freeze(Object.keys(VERTICAL_WORKFLOWS));
export const SERVICE_CADENCES=Object.freeze(['One-time','Weekly','Every 2 weeks','Monthly','Quarterly','Every 6 months','Annually','Custom']);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function normalizeVerticalWorkflow(value){
  if(value===null||value===undefined)return null;
  if(!object(value))throw new Error('Trade workflow must be an object or null.');
  const {industry,serviceType,values={},checks={},workNotes='',nextVisit='',cadence='One-time'}=value;
  const spec=VERTICAL_WORKFLOWS[industry];
  if(!spec)throw new Error('Choose a supported trade workflow.');
  if(!spec.types.includes(serviceType))throw new Error('Choose a valid trade service type.');
  if(!SERVICE_CADENCES.includes(cadence))throw new Error('Choose a valid service cadence.');
  if(!object(values)||!object(checks))throw new Error('Invalid trade service fields.');
  if(typeof workNotes!=='string'||workNotes.length>1000)throw new Error('Trade work notes must be 1000 characters or fewer.');
  if(typeof nextVisit!=='string'||(nextVisit!==''&&!validDate(nextVisit)))throw new Error('Enter a valid next-visit date.');
  const allowedFields=new Set(spec.fields.map(f=>f.id)),allowedChecks=new Set(spec.checks.map(s=>s.id));
  if(Object.keys(values).some(k=>!allowedFields.has(k))||Object.keys(checks).some(k=>!allowedChecks.has(k)))
    throw new Error('Unexpected trade workflow field.');
  const cleanValues={};
  for(const f of spec.fields){
    const input=values[f.id]??'';
    if(typeof input!=='string'||input.length>f.max)throw new Error(f.label+' is too long or invalid.');
    cleanValues[f.id]=input.trim();
  }
  const cleanChecks={};
  for(const item of spec.checks){
    const input=checks[item.id]??'todo';
    if(!['todo','done','na'].includes(input))throw new Error('Invalid service checklist status.');
    cleanChecks[item.id]=input;
  }
  return {industry,serviceType,values:cleanValues,checks:cleanChecks,workNotes:workNotes.trim(),nextVisit,cadence};
}
export function verticalProgress(value){
  const spec=VERTICAL_WORKFLOWS[value?.industry];
  if(!spec)return {reviewed:0,done:0,total:0};
  const counts=spec.checks.reduce((a,item)=>{
    const status=value?.checks?.[item.id]||'todo';
    if(status==='done')a.done++;
    if(status==='done'||status==='na')a.reviewed++;
    return a;
  },{reviewed:0,done:0,total:spec.checks.length});
  return counts;
}
