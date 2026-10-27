import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WORKSPACE_CATEGORIES,WORKSPACE_FEATURES,WORKSPACE_UTILITIES,resolveWorkspaceRoute,categoryFeatures,categoryDestination,workspaceRouteKnown,workspacePathLabel} from '../public/js/workspace-registry.js';
import {WORKSPACE_MODULES} from '../public/js/industry-workspaces.js';
import {renderCategoryNavigation,renderFeatureWorkspace} from '../public/js/workspace-navigation.js';
import {renderWorkspaceCustomizer} from '../public/js/workspace-customizer.js';
import {businessInsights,renderInsightsPage} from '../public/js/workspace-insights.js';
import {trustedGuideLink,guideNavigationLinks} from '../public/js/guide-links.js';
import {answerGuide} from '../server/guide-assistant.js';

test('every category feature resolves, has a trusted AI destination and an accessible connected tab',()=>{
  assert.equal(new Set(WORKSPACE_FEATURES.map(f=>f.href)).size,WORKSPACE_FEATURES.length);
  for(const f of WORKSPACE_FEATURES){
    assert.equal(resolveWorkspaceRoute(f.href),f);
    assert.equal(trustedGuideLink(f.href).href,f.href);
    assert.ok(WORKSPACE_CATEGORIES.some(c=>c.id===f.category));
    const html=renderFeatureWorkspace(f,undefined,'<p>Actual feature content</p>');
    assert.ok(html.includes('Actual feature content'));
    if(f.category!=='overview'){
      assert.match(html,/role="tablist"/);assert.match(html,/role="tabpanel"/);
      assert.ok(html.includes('aria-labelledby="workspace-tab-'+f.id+'"'));
      assert.equal((html.match(/aria-selected="true"/g)||[]).length,1);
    }
  }
  assert.equal((renderCategoryNavigation().match(/class="nav-link"/g)||[]).length,7);
});
test('all saved module combinations hide empty categories and preserve valid last-used destinations',()=>{
  const ids=WORKSPACE_MODULES.map(x=>x.id);
  for(let mask=1;mask<(1<<ids.length);mask++){
    const selected=ids.filter((_,i)=>mask&(1<<i));
    for(const category of WORKSPACE_CATEGORIES){
      const features=categoryFeatures(category.id,selected);
      for(const f of features)assert.ok(!f.modules.length||f.modules.some(id=>selected.includes(id)));
      if(features.length){
        assert.equal(categoryDestination(category.id,selected,{[category.id]:features.at(-1).id}),features.at(-1));
        assert.equal(categoryDestination(category.id,selected,{[category.id]:'unknown'}),features[0]);
      }
    }
    assert.equal(categoryFeatures('field',selected).length>0,selected.includes('jobs'));
    assert.equal(categoryFeatures('team',selected).length>0,selected.includes('jobs'));
  }
  assert.equal(categoryDestination('customers',['quotes'],{customers:'leads'}).id,'quotes');
});
test('hidden features remain reachable through old links without changing preferences',()=>{
  const modules=['invoices'],before=[...modules],route=resolveWorkspaceRoute('#leads',modules);
  assert.equal(route.href,'#customers/leads');
  assert.equal(categoryFeatures('customers',modules).length,0);
  assert.match(renderFeatureWorkspace(route,modules,'records'),/This tool is hidden/);
  assert.deepEqual(modules,before);
  for(const [legacy,canonical] of [['#jobs','#field/schedule'],['#bank','#billing/bank'],['#reviews','#marketing/reviews'],['#account','#settings'],['#marketing','#marketing/visibility']])assert.equal(resolveWorkspaceRoute(legacy).href,canonical);
  for(const unsafe of ['#constructor','#toString','#__proto__','#customers/../settings','#billing/unknown','https://evil.test','#marketing/reviews/extra','javascript:alert(1)']){assert.equal(workspaceRouteKnown(unsafe),false);assert.equal(trustedGuideLink(unsafe),null);assert.equal(resolveWorkspaceRoute(unsafe).id,'overview');}
});
test('tool chooser keeps each existing module exactly once and essential utilities remain registered',()=>{
  const html=renderWorkspaceCustomizer({modules:['jobs','leads']});
  for(const m of WORKSPACE_MODULES)assert.equal((html.match(new RegExp('name="modules" value="'+m.id+'"','g'))||[]).length,1);
  assert.ok(html.includes('Customers &amp; Sales'));assert.ok(html.includes('Billing &amp; Payments'));
  assert.deepEqual(WORKSPACE_UTILITIES.map(x=>x.id),['settings','customize','support']);
});
test('reports compute recorded statuses and never combine currencies or include draft debt',()=>{
  const ws={account:{currency:'USD'},leads:[{stage:'New',source:'Referral'},{stage:'Booked',source:'Referral'},{stage:'Done',source:'Website'}],jobs:[{status:'Confirmed'},{status:'Completed'}],followUps:[{dueDate:'2026-10-27',done:false},{dueDate:'2026-10-26',done:true}],reviews:[{status:'Reviewed'},{status:'Sent'}],quotes:[{}],invoices:[{currency:'USD',status:'Paid',total:100},{currency:'USD',status:'Draft',total:4000},{currency:'USD',status:'Sent',total:50,dueDate:'2026-10-26'},{currency:'INR',status:'Paid',total:900},{currency:'INR',status:'Sent',total:100,dueDate:'2026-10-29'}]};
  const data=businessInsights(ws,'2026-10-27');
  assert.equal(data.booked,2);assert.equal(data.bookingShare,200/3);assert.equal(data.activeJobs,1);assert.equal(data.dueFollowUps,1);assert.equal(data.receivedReviews,1);
  assert.deepEqual(data.currencies,[{currency:'USD',count:3,paid:100,outstanding:50,overdue:50,draft:4000},{currency:'INR',count:2,paid:900,outstanding:100,overdue:0,draft:0}]);
  assert.equal(businessInsights({}).bookingShare,null);
  assert.match(renderInsightsPage(ws,'revenue'),/Currencies stay separate/);
  assert.doesNotMatch(renderInsightsPage({...ws,leads:[{source:'<script>alert(1)</script>',stage:'New'}]},'sales'),/<script>/);
});
test('Ask Cerium gives category paths and verified destinations for old and new features',async()=>{
  for(const [question,path] of [['Where do I manage leads?','#customers/leads'],['I want to send an invoice','#billing/invoices'],['Where do I add crew members?','#team/crew'],['Show revenue insights','#insights/revenue']]){
    const answer=await answerGuide(question,'overview',{provider:'guide'});
    assert.ok(answer.links.some(l=>l.href===path),question+': '+JSON.stringify(answer.links));
    assert.ok(answer.links.every(l=>l.label.includes('→')));
  }
  assert.equal(workspacePathLabel(resolveWorkspaceRoute('#reviews')),'Marketing & Reputation → Reviews');
  assert.equal(guideNavigationLinks({section:'payments'},'match a bank deposit')[0].href,'#billing/bank');
});

test('assistant does not advertise unsupported partial payments or undo matching',async()=>{
  const partial=await answerGuide('How do partial payments and bank deposits work?','payments',{provider:'guide'});
  assert.match(partial.reply,/partial payments.*not (currently )?supported/i);
  assert.doesNotMatch(partial.reply,/balance automatically/);
  const undo=await answerGuide('How do I undo match?','payments',{provider:'guide'});
  assert.match(undo.reply,/no Undo match control/i);
});
