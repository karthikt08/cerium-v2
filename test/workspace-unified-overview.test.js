import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const code=read('js/app.js');
const overviewCode=code.slice(code.indexOf('function overview()'),code.indexOf('function toolbar(',code.indexOf('function overview()')));
assert.ok(overviewCode.startsWith('function overview()'),'find original Overview implementation');

function renderOverview({country='IN',currency=country==='IN'?'INR':'USD',category='cleaning',upiVpa='',mismatch=false,name='Zartym'}={}){
  const account={name,country,currency,timeZone:'Asia/Kolkata',workspacePreferences:{category},upiVpa};
  const ws={account,followUps:[],invoices:[],leads:[],reviews:[]};
  const icon=name=>'<svg data-icon="'+name+'"></svg>';
  const button=(label,action,extra='',style='primary')=>'<button class="button '+style+'" data-action="'+action+'" '+extra+'>'+label+'</button>';
  const context={
    state:{ws},
    metrics:()=>({leads:0,due:0,outstanding:0,overdue:0,reviews:0}),
    filteredRows:()=>[],
    INDUSTRY_OPTIONS:[{value:'cleaning',label:'Cleaning & maintenance'}],
    isIndia:()=>country==='IN'&&currency==='INR',
    currencyMismatch:()=>mismatch,
    STAGES:['New','Quoted','Booked','Done'],
    dashboardCash:()=>country==='IN'?'₹0':'$0',cash:()=>country==='IN'?'₹0':'$0',
    renderOverviewTools:()=>'<div data-custom-tools>Existing tool widgets</div>',
    icon,
    esc:value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
    addButton:(kind,label)=>button(icon('plus')+label,'new','data-kind="'+kind+'"'),
    button,
    panelHeader:(_section,title)=>'<header class="panel-header"><h2>'+title+'</h2></header>',
    viewLink:section=>'<a href="#'+section+'" data-nav="'+section+'">View all</a>',
    empty:()=>'<p class="empty-state">Nothing here yet</p>',
    badge:status=>'<span class="badge">'+status+'</span>',
  };
  const fn=runInNewContext('('+overviewCode+')',context,{timeout:1000});
  return fn();
}

test('all three previously stacked cards become one semantic midnight Overview on Indian workspace',()=>{
  const html=renderOverview({upiVpa:'merchant@upi'});
  const parent=html.indexOf('<section class="overview-stage overview-stage-unified"');
  const tools=html.indexOf('<section class="overview-workspace-row"');
  const india=html.indexOf('<section class="overview-india-row"');
  const metrics=html.indexOf('<div class="metrics-grid">');
  assert.ok(parent>=0&&tools>parent&&india>tools&&metrics>india,'three sections remain contiguous before KPI grid');
  assert.equal((html.match(/overview-stage-unified/g)||[]).length,1,'one combined hero only');
  assert.doesNotMatch(html,/class="india-guide"/,'no duplicate standalone India banner');
  assert.doesNotMatch(html,/class="notice" role="status"/,'no duplicate workspace notice');
  assert.match(html,/Your Cleaning &amp; maintenance workspace/,'business type stays dynamic and escaped');
  assert.match(html,/merchant@upi|UPI ID is configured/,'existing UPI configuration message preserved');
  assert.match(html,/GST drafts require accountant review/,'existing India compliance messaging preserved');
  assert.match(html,/INDIA EDITION ACTIVE · INR BILLING · ₹500 \/ MONTH/);
  assert.match(html,/data-action="new" data-kind="invoice"/,'INR invoice creation still uses original action');
  assert.match(html,/data-custom-tools/,'business-specific tool widgets remain after metrics');
});

test('new header preserves working hash routes and create actions',()=>{
  const html=renderOverview();
  for(const section of ['jobs','invoices','marketing','settings']){
    assert.match(html,new RegExp('href="#'+section+'" data-nav="'+section+'"'),
      'must preserve native app navigation to '+section);
  }
  assert.match(html,/data-action="new" data-kind="lead"/,'new lead action remains');
  assert.match(html,/Set up GST & UPI/,'Settings deep link remains');
  assert.match(html,/Create INR invoice/,'invoice CTA remains');
  assert.match(html,/Customize your tools/,'customize link remains');
  assert.match(html,/Active leads/);
  assert.match(html,/Today’s follow-ups/);
  assert.match(html,/Awaiting payment/);
});

test('non-India workspaces get compact greeting and custom tools without region-specific controls',()=>{
  const html=renderOverview({country:'US',currency:'USD',category:'other',name:'Alex'});
  assert.match(html,/Good [^<]+, <span class="overview-title-accent">Alex\.<\/span>/);
  assert.match(html,/Your custom workspace/);
  assert.match(html,/class="overview-workspace-row"/);
  assert.doesNotMatch(html,/class="overview-india-row"/);
  assert.doesNotMatch(html,/Set up GST & UPI|Create INR invoice|₹500/);
  assert.match(html,/class="metrics-grid"/);
  assert.equal((html.match(/class="overview-stage overview-stage-unified"/g)||[]).length,1);
});

test('historical currency warning stays separate and is not lost during the merge',()=>{
  const html=renderOverview({mismatch:true});
  const hero=html.indexOf('<section class="overview-stage overview-stage-unified"');
  const warning=html.indexOf('Previous currency records');
  const metrics=html.indexOf('<div class="metrics-grid">');
  assert.ok(hero>=0&&warning>hero&&metrics>warning);
  assert.match(html,/They are preserved as originally recorded/);
});

test('night header is confined to Overview; preserve responsive, readable and print variants',()=>{
  const css=read('css/workspace-overview-unified.css');
  const app=read('app.html');
  const styles=[...app.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(styles.slice(-4),['css/ui-consistency.css','css/workspace-overview-unified.css','css/workspace-blue-actions.css','css/typography.css']);
  for(const marker of ['.overview-stage.overview-stage-unified','.overview-stage-main',
    '.overview-workspace-row','.overview-india-row','.overview-shortcut:hover',
    '.overview-customize-link:focus-visible','@media(max-width:1080px)',
    '@media(max-width:760px)','@media(max-width:430px)',
    '@media(prefers-reduced-motion:reduce)','@media print']){
    assert.ok(css.includes(marker),'missing responsive or focus styling: '+marker);
  }
  for(const color of ['#19243f','#111723','#101319','#19171f'])
    assert.ok(css.includes(color),'pricing night gradient missing '+color);
  assert.doesNotMatch(css,/\.app-page\s*\{\s*background|\.main-frame\s*\{\s*background|\.sidebar\s*\{\s*background/,
    'must not apply dark theme to the entire workspace');
  assert.doesNotMatch(css,/\.metric\s*\{\s*background|\.data-table\s*\{\s*background/,
    'operational metrics and tables must keep their existing light colors');
});
