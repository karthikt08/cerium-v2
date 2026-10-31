import {test} from 'node:test';
import assert from 'node:assert/strict';
import {INDUSTRY_PROFILES} from '../public/js/industry-workspaces.js';
import {BUSINESS_PERSONALIZATIONS,INDUSTRY_WORKSPACE_PERSONALIZATIONS,activeBusinessId,activeBusinessViews,businessCategoryLabel,businessFeatureLabel} from '../public/js/business-personalization.js';
import {WORKSPACE_FEATURES,resolveWorkspaceRoute} from '../public/js/workspace-registry.js';
import {renderFeatureWorkspace} from '../public/js/workspace-navigation.js';
import {renderPersonalizedOperationsPage,renderPersonalizedOverview} from '../public/js/personalized-operations-page.js';
import {renderVerticalEditor} from '../public/js/vertical-workflows-ui.js';
import {VERTICAL_WORKFLOWS,normalizeVerticalWorkflow} from '../public/js/vertical-workflows.js';

const report=(industry,extra={})=>normalizeVerticalWorkflow({
  industry,serviceType:VERTICAL_WORKFLOWS[industry].types[0],
  values:industry==='hvac'?{serial:'AC-479',equipment:'Heat pump'}:industry==='cleaning'?{property:'Office suite'}:{site:'North field',irrigation:'Valve 3 checked'},
  checks:{},nextVisit:'2027-01-12',...extra
});
const fixture=(category)=>({
  account:{timeZone:'UTC',workspacePreferences:{category,modules:['jobs','leads','quotes','payments','invoices','followups']}},
  jobs:[
    {id:'h',title:'Heat pump service',customerName:'Casey HVAC',startAt:'2026-11-15T09:00',status:'Completed',address:'31 Oak Road',verticalWorkflow:report('hvac')},
    {id:'c',title:'Office cleaning',customerName:'Harper Cleaning',startAt:'2026-11-16T09:00',status:'Scheduled',address:'78 Pine Road',verticalWorkflow:report('cleaning',{cadence:'Weekly'})},
    {id:'l',title:'Irrigation visit',customerName:'Avery Lawn',startAt:'2026-11-17T09:00',status:'Scheduled',address:'22 Elm Road',verticalWorkflow:report('landscaping')}
  ],
  leads:[{stage:'New'}],quotes:[{status:'Draft'}],crew:[],invoices:[]
});

test('all ten business types have their own naming identity, only three have deep service centers',()=>{
  assert.deepEqual(Object.keys(INDUSTRY_WORKSPACE_PERSONALIZATIONS).sort(),INDUSTRY_PROFILES.map(p=>p.id).sort());
  assert.deepEqual(Object.keys(BUSINESS_PERSONALIZATIONS).sort(),['cleaning','hvac','landscaping']);
  for(const p of INDUSTRY_PROFILES){
    const ws=fixture(p.id),name=businessCategoryLabel('field',ws);
    assert.ok(name&&name!=='Field Service',p.id);
    assert.ok(businessFeatureLabel('schedule',ws),p.id);
    assert.match(renderPersonalizedOverview(ws),new RegExp(INDUSTRY_WORKSPACE_PERSONALIZATIONS[p.id].title));
  }
  assert.equal(activeBusinessId(fixture('construction')),null);
});
test('navigation displays only the selected business and preserves real deep-link destinations',()=>{
  const feature=WORKSPACE_FEATURES.find(f=>f.id==='trade-workflows');
  for(const industry of ['hvac','cleaning','landscaping']){
    const ws=fixture(industry),route=resolveWorkspaceRoute('#field/trade-workflows');
    const html=renderFeatureWorkspace(route,ws.account.workspacePreferences.modules,
      renderPersonalizedOperationsPage(ws,false,'overview'),ws);
    const views=activeBusinessViews(route,ws);
    assert.equal(views.length,5);
    for(const view of views)assert.ok(html.includes('href="#field/trade-workflows/'+view.id+'"'));
    const hidden=Object.keys(BUSINESS_PERSONALIZATIONS).filter(id=>id!==industry);
    for(const other of hidden){
      assert.doesNotMatch(html,new RegExp('data-job-vertical="'+other+'"'));
      assert.doesNotMatch(html,new RegExp('href="#field/trade-workflows/'+other+'"'));
    }
    assert.match(html,/data-job-action="new"/);
    assert.ok(html.includes(BUSINESS_PERSONALIZATIONS[industry].title));
    assert.equal(resolveWorkspaceRoute('#field/trade-workflows/revisits').id,feature.id);
  }
  const basic=fixture('plumbing');
  const main=renderFeatureWorkspace(resolveWorkspaceRoute('#field/schedule'),basic.account.workspacePreferences.modules,'Real calendar',basic);
  assert.match(main,/Plumbing Operations/);
  assert.match(main,/Call-out Calendar/);
  assert.doesNotMatch(main,/data-feature="trade-workflows"/);
});
test('HVAC equipment history, cleaning plans and landscaping irrigation use real service records',()=>{
  const hvac=fixture('hvac');
  const equipment=renderPersonalizedOperationsPage(hvac,false,'assets');
  assert.match(equipment,/AC-479/);
  assert.match(equipment,/Casey HVAC/);
  assert.doesNotMatch(equipment,/Harper Cleaning|Avery Lawn/);
  const reports=renderPersonalizedOperationsPage(hvac,false,'reports');
  assert.match(reports,/Heat pump service/);
  const cleaning=renderPersonalizedOperationsPage(fixture('cleaning'),false,'plans');
  assert.match(cleaning,/Office cleaning/);
  assert.match(cleaning,/Weekly service plan/);
  assert.doesNotMatch(cleaning,/Heat pump service/);
  const irrigation=renderPersonalizedOperationsPage(fixture('landscaping'),false,'irrigation');
  assert.match(irrigation,/Irrigation visit/);
  assert.doesNotMatch(irrigation,/Office cleaning/);
});
test('job editor only offers the selected trade and validates repeat-service cadence',()=>{
  const h=renderVerticalEditor(report('hvac'),'hvac');
  assert.match(h,/HVAC &amp; refrigeration/);
  assert.doesNotMatch(h,/Cleaning &amp; maintenance|Landscaping &amp; lawn care/);
  assert.match(h,/Service cadence/);
  assert.equal(normalizeVerticalWorkflow({industry:'cleaning',serviceType:VERTICAL_WORKFLOWS.cleaning.types[0],cadence:'Weekly'}).cadence,'Weekly');
  assert.throws(()=>normalizeVerticalWorkflow({industry:'hvac',serviceType:VERTICAL_WORKFLOWS.hvac.types[0],cadence:'every minute'}),/valid service cadence/);
  assert.match(renderVerticalEditor(null,''),/General job/);
  assert.doesNotMatch(renderVerticalEditor(null,''),/HVAC &amp; refrigeration/);
});
test('switching business types changes the UI but never mutates or deletes other records',()=>{
  const ws=fixture('hvac'),before=structuredClone(ws.jobs);
  assert.match(renderPersonalizedOperationsPage(ws,false,'overview'),/Heat pump service|HVAC Service Center/);
  ws.account.workspacePreferences.category='cleaning';
  assert.match(renderPersonalizedOperationsPage(ws,false,'overview'),/Cleaning Operations/);
  assert.deepEqual(ws.jobs,before);
});
