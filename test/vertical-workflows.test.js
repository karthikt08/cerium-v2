import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VERTICAL_IDS,VERTICAL_WORKFLOWS,normalizeVerticalWorkflow,verticalProgress} from '../public/js/vertical-workflows.js';
import {WORKSPACE_FEATURES,resolveWorkspaceRoute} from '../public/js/workspace-registry.js';
import {subfeaturesFor,subviewHref} from '../public/js/workspace-subviews.js';

test('trade workflow definitions have unique fields and checklist IDs',()=>{
  assert.deepEqual(VERTICAL_IDS,['hvac','cleaning','landscaping']);
  for(const id of VERTICAL_IDS){
    const spec=VERTICAL_WORKFLOWS[id];
    assert.ok(spec.fields.length>=6&&spec.checks.length>=8);
    assert.equal(new Set(spec.fields.map(f=>f.id)).size,spec.fields.length);
    assert.equal(new Set(spec.checks.map(f=>f.id)).size,spec.checks.length);
    const value=normalizeVerticalWorkflow({industry:id,serviceType:spec.types[0]});
    assert.equal(value.industry,id);
    assert.equal(verticalProgress(value).reviewed,0);
    assert.equal(verticalProgress(value).total,spec.checks.length);
  }
});
test('trade job reports validate field lengths, checklist statuses and calendar dates',()=>{
  const full=normalizeVerticalWorkflow({
    industry:'hvac',serviceType:VERTICAL_WORKFLOWS.hvac.types[1],
    values:{equipment:'Heat pump',makeModel:'Brand X / 42'},
    checks:{site:'done',coil:'na'},
    nextVisit:'2026-11-15',workNotes:'Operating check logged.'
  });
  assert.equal(full.values.equipment,'Heat pump');
  assert.deepEqual(verticalProgress(full),{reviewed:2,done:1,total:8});
  assert.equal(full.nextVisit,'2026-11-15');
  assert.equal(normalizeVerticalWorkflow(null),null);
  assert.throws(()=>normalizeVerticalWorkflow({industry:'hvac',serviceType:'Invented'}),/valid trade service type/);
  assert.throws(()=>normalizeVerticalWorkflow({industry:'cleaning',serviceType:VERTICAL_WORKFLOWS.cleaning.types[0],checks:{floors:'signed'}}),/checklist/);
  assert.throws(()=>normalizeVerticalWorkflow({industry:'hvac',serviceType:VERTICAL_WORKFLOWS.hvac.types[0],nextVisit:'2026-02-30'}),/next-visit/);
  assert.throws(()=>normalizeVerticalWorkflow({industry:'hvac',serviceType:VERTICAL_WORKFLOWS.hvac.types[0],values:{secret:'hidden'}}),/Unexpected/);
  assert.throws(()=>normalizeVerticalWorkflow({industry:'hvac',serviceType:VERTICAL_WORKFLOWS.hvac.types[0],values:{fault:'X'.repeat(351)}}),/too long/);
});
test('Trade Workflows is a real, deep-linkable Field Service feature',()=>{
  const feature=WORKSPACE_FEATURES.find(f=>f.id==='trade-workflows');
  assert.ok(feature);
  assert.equal(feature.category,'field');
  assert.deepEqual(feature.modules,['jobs']);
  assert.equal(resolveWorkspaceRoute('#field/trade-workflows').id,feature.id);
  for(const view of subfeaturesFor(feature)){
    assert.equal(resolveWorkspaceRoute(subviewHref(feature,view.id)).subview,view.id);
  }
});
