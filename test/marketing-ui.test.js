import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MARKETING_FEATURE_TABS,renderMarketingPage} from '../public/js/marketing-page.js';
import {guideNavigationLinks,trustedGuideLink} from '../public/js/guide-links.js';

const css=fs.readFileSync(new URL('../public/css/marketing.css',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../public/js/marketing-page.js',import.meta.url),'utf8');
const assistant=fs.readFileSync(new URL('../public/js/guide-assistant.js',import.meta.url),'utf8');
const empty=()=>({account:{businessName:'Sample',timeZone:'UTC'},leads:[],reviews:[],followUps:[],invoices:[]});

test('Marketing is a horizontal tab bar above one large shared feature screen',()=>{
  const html=renderMarketingPage(empty());
  const nav=html.indexOf('class="marketing-switcher"');
  const pane=html.indexOf('class="marketing-main"');
  assert.ok(nav>=0&&pane>nav,'The top tab strip comes immediately before the shared content surface');
  assert.ok(!html.includes('marketing-hero'),'Remove the previous oversized banner to free screen space');
  assert.ok(!html.includes('marketing-orbit'),'Avoid needless decorative dashboard art');
  assert.ok(!html.includes('marketing-switcher-title'),'No vertical sidebar-style navigation');
  assert.match(html,/Marketing <span>workspace/);
  assert.match(html,/data-marketing-page/);
  assert.match(css,/\.marketing-main\{[^}]*min-height:/);
  assert.match(css,/\.marketing-switcher\{[^}]*display:flex/);
  assert.match(css,/\.marketing-switcher\{[^}]*overflow-x:auto/);
  assert.match(css,/\.marketing-tab::before/);
  assert.match(css,/clip-path:polygon/,'Feature tabs should have diagonal/slanted ends');
  assert.match(css,/\.marketing-tab\.active::after/);
});

test('Feature tabs are data driven and every tab owns a matching real panel',()=>{
  const html=renderMarketingPage(empty());
  assert.deepEqual(MARKETING_FEATURE_TABS.map(x=>x.key),['visibility','reengage','performance']);
  assert.equal(new Set(MARKETING_FEATURE_TABS.map(x=>x.key)).size,MARKETING_FEATURE_TABS.length);
  for(const {key,label} of MARKETING_FEATURE_TABS){
    assert.match(html,new RegExp('id="marketing-tab-'+key+'"'));
    assert.match(html,new RegExp('id="marketing-panel-'+key+'"'));
    assert.match(html,new RegExp('data-marketing-tab="'+key+'"'));
    assert.match(html,new RegExp('data-marketing-panel="'+key+'"'));
    assert.ok(html.includes(label),label);
    assert.ok(trustedGuideLink('#marketing/'+key));
  }
  assert.ok(html.includes('role="tablist"'));
  assert.ok(html.includes('aria-controls="marketing-panel-visibility"'));
  assert.ok(html.includes('aria-selected="true"'));
  assert.ok(html.includes('tabindex="-1"'));
  assert.ok(!html.includes('Feature 4'),'No fictional placeholder features');
});

test('All existing functionality still lives inside the shared panel',()=>{
  const html=renderMarketingPage(empty());
  for(const attr of [
    'data-marketing-draft','data-marketing-draft-kind','data-marketing-service',
    'data-marketing-copy','data-marketing-generate','data-marketing-copy-status',
    'class="marketing-customer-list"','marketing-insight-grid','marketing-sources'
  ])assert.ok(html.includes(attr),attr);
  assert.match(html,/No messages are sent automatically/);
  assert.match(html,/What we do not measure yet/);
  assert.match(ui,/await api\.createFollowUp\(marketingFollowUp\(person/);
  assert.match(ui,/readOnly\(\)/);
  assert.doesNotMatch(ui,/api\.sendCampaign|api\.publishPost|api\.bulkText/);
  assert.match(ui,/navigator\.clipboard\.writeText/);
});

test('Customer-derived content is safely escaped and every metric is grounded',()=>{
  const html=renderMarketingPage({
    account:{businessName:'<script>bad</script>',trade:'<svg onload=alert(1)>',timeZone:'UTC'},
    leads:[{source:'<img src=x onerror=alert(1)>',name:'Private Person',stage:'New'}],
    reviews:[],invoices:[],followUps:[]
  });
  assert.doesNotMatch(html,/<script>bad<\/script>/);
  assert.doesNotMatch(html,/<svg onload/);
  assert.doesNotMatch(html,/<img src=x onerror/);
  assert.match(html,/&lt;img/);
  assert.match(html,/Review accuracy, permission and platform rules before sharing/);
  assert.match(html,/No messages are sent automatically/);
  assert.match(html,/Human review required/);
  assert.match(html,/YOUR ACTIVITY/);
  assert.match(html,/1 <span>leads<\/span>/);
});

test('Tabs support keyboard navigation, scrolling and stable marketing links',()=>{
  assert.match(ui,/tab\.tabIndex=on\?0:-1/);
  assert.match(ui,/event\.key==='ArrowDown'/);
  assert.match(ui,/event\.key==='ArrowRight'/);
  assert.match(ui,/event\.key==='Home'/);
  assert.match(ui,/event\.key==='End'/);
  assert.match(ui,/navigateTo\(tabs\[selected\]\.key\)/);
  assert.match(ui,/history\.replaceState\(null,'',hash\)/);
  assert.match(ui,/scrollIntoView/);
  assert.match(ui,/choose\(deepLink\(\)\)/);
  assert.match(ui,/tabs\.find\(tab=>location\.hash/);
  for(const feature of MARKETING_FEATURE_TABS)assert.ok(trustedGuideLink('#marketing/'+feature.key));
});

test('Viewport keeps a large panel and scrollable feature tabs rather than stacking tab buttons',()=>{
  assert.match(css,/@media\(max-width:960px\)/);
  assert.match(css,/@media\(max-width:680px\)/);
  assert.match(css,/@media\(max-width:420px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/\.marketing-tab\{[^}]*flex:0 0 auto/);
  assert.match(css,/\.marketing-switcher\{[^}]*flex-wrap:nowrap/);
  assert.match(css,/\.marketing-main\{[^}]*border:2px solid/);
  assert.match(css,/\.marketing-layout\{[^}]*width:100%/);
  const globalStyle=fs.readFileSync(new URL('../public/css/workspace-vibrance.css',import.meta.url),'utf8');
  assert.doesNotMatch(globalStyle,/\.app-page \.marketing-tab\.active/);
});

test('Ask Cerium still links to all three Marketing feature panes',()=>{
  assert.match(assistant,/marketing:\s*\[/);
  assert.match(assistant,/label: "Create a post"/);
  assert.match(assistant,/label: "Re-book customers"/);
  assert.match(assistant,/label: "Lead sources"/);
  assert.match(assistant,/guide-links-heading/);
  assert.match(assistant,/anchor\.href=trusted\.href/);
  const links=guideNavigationLinks({section:'marketing',source:'guide',matched:true},'How do I track marketing performance?');
  assert.ok(links.some(link=>link.href==='#marketing/performance'));
  assert.ok(!links.some(link=>link.href.startsWith('https://')));
});
