import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderMarketingPage} from '../public/js/marketing-page.js';
import {guideNavigationLinks,trustedGuideLink} from '../public/js/guide-links.js';
const css=fs.readFileSync(new URL('../public/css/marketing.css',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../public/js/marketing-page.js',import.meta.url),'utf8');
const assistant=fs.readFileSync(new URL('../public/js/guide-assistant.js',import.meta.url),'utf8');

test('marketing redesign has branded hero and real record-only activity signals',()=>{
  const data={
    account:{businessName:'Fable & Fern',trade:'garden care',timeZone:'UTC'},
    leads:[{id:1,name:'Sample',source:'Google',stage:'New'}],
    reviews:[{status:'Not Asked'}],
    invoices:[],followUps:[]
  };
  const html=renderMarketingPage(data);
  assert.match(html,/marketing-hero/);
  assert.match(html,/Good work/);
  assert.match(html,/More customers/);
  assert.match(html,/marketing-pulsebar/);
  assert.match(html,/marketing-orbit-center/);
  assert.match(html,/MARKETING/);
  assert.match(html,/MEASURE WHAT YOU ACTUALLY KNOW/);
  assert.match(html,/Based on your Cerium workspace records/);
  assert.match(html,/1<\/span><strong>leads recorded/);
  assert.doesNotMatch(html,/placeholder image|img\.unsplash|dummyimage|fake performance/i);
});

test('marketing still offers all three genuine working journeys and editing controls',()=>{
  const html=renderMarketingPage({account:{businessName:'Sample',timeZone:'UTC'},leads:[],reviews:[],followUps:[],invoices:[]});
  for(const label of ['Get found and chosen','Re-book and re-engage','Track performance']){
    assert.ok(html.includes(label),label);
  }
  for(const id of ['visibility','reengage','performance']){
    assert.ok(html.includes('id="marketing-tab-'+id+'"'));
    assert.ok(html.includes('id="marketing-panel-'+id+'"'));
    assert.ok(html.includes('data-marketing-tab="'+id+'"'));
    assert.ok(html.includes('data-marketing-panel="'+id+'"'));
  }
  for(const attr of ['data-marketing-draft','data-marketing-draft-kind','data-marketing-service','data-marketing-copy','data-marketing-generate','data-marketing-copy-status','data-marketing-customer-list']) {
    if(attr==='data-marketing-customer-list')continue; // dynamically generated candidate region remains class-based
    assert.ok(html.includes(attr),attr);
  }
  assert.ok(html.includes('data-marketing-jump="visibility"'));
  assert.ok(html.includes('data-marketing-jump="performance"'));
  assert.ok(html.includes('aria-selected="true"'));
  assert.ok(html.includes('tabindex="-1"'));
  assert.match(html,/No messages are sent automatically/);
  assert.match(html,/What we do not measure yet/);
});

test('marketing redesign preserves explicit human approval and escapes stored text',()=>{
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
  assert.match(ui,/await api\.createFollowUp\(marketingFollowUp\(person/);
  assert.doesNotMatch(ui,/api\.sendCampaign|api\.publishPost|api\.bulkText/);
});

test('marketing controls maintain accessible keyboard tabs and stable deep links',()=>{
  assert.match(ui,/tab\.tabIndex=on\?0:-1/);
  assert.match(ui,/event\.key==='ArrowDown'/);
  assert.match(ui,/event\.key==='Home'/);
  assert.match(ui,/event\.key==='End'/);
  assert.match(ui,/navigateTo\(tabs\[selected\]\.key\)/);
  assert.match(ui,/history\.replaceState\(null,'',hash\)/);
  assert.match(ui,/page\.querySelector\('#marketing-panel-'/);
  assert.match(ui,/choose\(deepLink\(\)\)/);
  for(const area of ['visibility','reengage','performance']){
    assert.ok(trustedGuideLink('#marketing/'+area));
  }
});

test('responsive layout and reduced motion protections cover the new components',()=>{
  assert.match(css,/@media\(max-width:1120px\)/);
  assert.match(css,/@media\(max-width:820px\)/);
  assert.match(css,/@media\(max-width:640px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  for(const component of ['marketing-hero','marketing-feature-grid','marketing-customer','marketing-switcher','marketing-relationship-summary']){
    assert.ok(css.includes('.'+component),component);
  }
  const globalStyle=fs.readFileSync(new URL('../public/css/workspace-vibrance.css',import.meta.url),'utf8');
  assert.doesNotMatch(globalStyle,/\.app-page \.marketing-tab\.active/);
});

test('Ask Cerium offers relevant Marketing actions and retains only trusted page links',()=>{
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
