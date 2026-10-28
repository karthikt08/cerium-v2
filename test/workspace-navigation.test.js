import fs from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WORKSPACE_CATEGORIES,WORKSPACE_FEATURES,WORKSPACE_UTILITIES,resolveWorkspaceRoute,categoryFeatures,categoryDestination,workspaceRouteKnown,workspacePathLabel} from '../public/js/workspace-registry.js';
import {WORKSPACE_MODULES} from '../public/js/industry-workspaces.js';
import {SIDEBAR_CATEGORIES,renderCategoryNavigation,renderUtilityNavigation,renderFeatureWorkspace} from '../public/js/workspace-navigation.js';
import {renderWorkspaceCustomizer} from '../public/js/workspace-customizer.js';
import {businessInsights,renderInsightsPage} from '../public/js/workspace-insights.js';
import {trustedGuideLink,guideNavigationLinks} from '../public/js/guide-links.js';
import {answerGuide} from '../server/guide-assistant.js';

test('every feature has a trusted AI destination and is reachable without nested tab rows',()=>{
  assert.equal(new Set(WORKSPACE_FEATURES.map(f=>f.href)).size,WORKSPACE_FEATURES.length);
  for(const f of WORKSPACE_FEATURES){
    assert.equal(resolveWorkspaceRoute(f.href),f);
    assert.equal(trustedGuideLink(f.href).href,f.href);
    assert.ok(WORKSPACE_CATEGORIES.some(c=>c.id===f.category));
    const html=renderFeatureWorkspace(f,undefined,'<p>Actual feature content</p>');
    assert.ok(html.includes('Actual feature content'));
    if(!['overview','settings','assistant','support'].includes(f.category)){
      assert.match(html,/data-workspace-destination/);
      assert.match(html,/role="region"/);
      assert.ok(html.includes('value="'+f.href+'"'));
      assert.doesNotMatch(html,/role="tablist"|role="tabpanel"|workspace-subfeature-strip|workspace-feature-tab/);
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

test('assistant describes payment allocation and the existing bank-match limitation',async()=>{
  const partial=await answerGuide('How do partial payments and bank deposits work?','payments',{provider:'guide'});
  assert.match(partial.reply,/Payment Ledger & Allocation/);
  assert.doesNotMatch(partial.reply,/balance automatically/);
  const undo=await answerGuide('How do I undo match?','payments',{provider:'guide'});
  assert.match(undo.reply,/no Undo match control/i);
});

test('a single workspace picker replaces the two horizontal tab rows on every category',()=>{
  for(const [href,expected] of [
    ['#customers/leads',['#customers/leads','#customers/followups','#customers/quotes','#customers/leads/board','#customers/leads/active']],
    ['#billing/invoices',['#billing/invoices','#billing/payments','#billing/reminders','#billing/invoices/Paid']],
    ['#team/crew',['#team/crew','#team/assignments','#team/inventory']]
  ]){
    const html=renderFeatureWorkspace(resolveWorkspaceRoute(href),undefined,'<div>Actual content</div>');
    assert.match(html,/class="workspace-view-picker"/);
    assert.match(html,/id="workspace-destination" data-workspace-destination/);
    for(const target of expected)assert.ok(html.includes('value="'+target+'"'),target);
    assert.match(html,/Actual content/);
    assert.doesNotMatch(html,/workspace-feature-tabs|workspace-subfeature-strip|workspace-feature-tab|workspace-subfeature-tab|role="tablist"|role="tabpanel"/);
  }
  const href='#customers/leads/board';
  const html=renderFeatureWorkspace(resolveWorkspaceRoute(href),undefined,'Board content');
  assert.match(html,/value="#customers\/leads\/board" selected/);
  assert.equal((html.match(/<select\b/g)||[]).length,1);
});

test('seven pre-PR99 sidebar sections and standalone utility pages retain modern routes',()=>{
  assert.deepEqual(SIDEBAR_CATEGORIES.map(c=>c.id),[
    'overview','customers','field','billing','marketing','team','insights'
  ]);
  assert.equal((renderCategoryNavigation().match(/class="nav-link"/g)||[]).length,7);
  assert.deepEqual(WORKSPACE_CATEGORIES.map(c=>c.id),[
    'overview','customers','field','billing','marketing','team','insights',
    'settings','assistant','support'
  ],'newer deep links stay registered without crowding the original sidebar');
  const utility=renderUtilityNavigation();
  for(const href of ['settings','settings/tools','support'])assert.ok(utility.includes('data-nav="'+href+'"'));
  for(const href of ['#settings','#settings/tools','#assistant/feature-discovery','#support']){
    const route=resolveWorkspaceRoute(href),content='<div>Standalone page</div>';
    assert.equal(renderFeatureWorkspace(route,undefined,content),content,href);
  }
  assert.equal(resolveWorkspaceRoute('#overview').label,'Overview');
  assert.equal(resolveWorkspaceRoute('#settings/data-management').section,'settings');
  assert.equal(resolveWorkspaceRoute('#assistant/workflow-guidance').section,'assistant');
  assert.equal(resolveWorkspaceRoute('#support/support-requests').section,'support');
  const css=fs.readFileSync(new URL('../public/css/workspace-navigation.css',import.meta.url),'utf8');
  assert.match(css,/border-radius:5px 5px 0 0;background:#e9edf6/);
  assert.match(css,/\.app-page #page-body \.workspace-feature-panel\{[^}]*box-shadow:none!important/);
  assert.match(css,/border-radius:7px;padding:3px;gap:0/);
  assert.doesNotMatch(css,/workspace-panel-chrome|workspace-chrome-dots|border-top:3\.5px solid #2f5bff/);
  const ordinary=renderFeatureWorkspace(resolveWorkspaceRoute('#customers/leads'),undefined,'Leads');
  assert.doesNotMatch(ordinary,/workspace-panel-chrome|workspace-chrome-status|workspace-subfeature-strip/);
});

test('Overview restores its exact standalone pre-PR99 layout',()=>{
  const content='<div>Dashboard</div>';
  for(const href of ['#overview','#overview/kpis','#overview/actions','#overview/workspace']){
    const html=renderFeatureWorkspace(resolveWorkspaceRoute(href),undefined,content);
    assert.equal(html,content);
    assert.doesNotMatch(html,/workspace-feature-content|workspace-subfeature-strip|workspace-panel-chrome/);
  }
});


test('assistant subviews provide distinct user-triggered guidance',async()=>{
  const {renderGuidancePage}=await import('../public/js/workspace-view-panels.js');
  const discovery=renderGuidancePage(resolveWorkspaceRoute('#assistant/feature-discovery/modules'));
  const typing=renderGuidancePage(resolveWorkspaceRoute('#assistant/response-experience/progressive'));
  assert.match(discovery,/Recommend tools/);
  assert.match(typing,/Show full answer/);
  assert.doesNotMatch(discovery,/Show full answer/);
  assert.match(typing,/data-action="ask-guide"/);
});

test('registered subviews resolve exactly and preserve legacy feature links',async()=>{
  const {FEATURE_SUBFEATURES,subviewHref}=await import('../public/js/workspace-subviews.js');
  for(const feature of WORKSPACE_FEATURES){
    for(const sub of FEATURE_SUBFEATURES[feature.id]||[]){
      const href=subviewHref(feature,sub.id),route=resolveWorkspaceRoute(href);
      assert.equal(route.id,feature.id);
      assert.equal(route.subview,sub.id);
      assert.equal(route.featureHref,feature.href);
      assert.equal(workspaceRouteKnown(href),true);
      assert.ok(workspacePathLabel(route).includes(sub.label));
      assert.equal(categoryDestination(feature.category,undefined,{[feature.category]:href}).href,href);
    }
    assert.equal(resolveWorkspaceRoute(feature.href),feature);
  }
  for(const href of ['#customers/leads/unknown','#customers/leads/board/extra','#billing/bank/__proto__']){
    assert.equal(workspaceRouteKnown(href),false);
    assert.equal(resolveWorkspaceRoute(href).id,'overview');
  }
});
