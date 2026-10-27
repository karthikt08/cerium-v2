import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderMarketingPage} from '../public/js/marketing-page.js';
import {renderFeatureWorkspace} from '../public/js/workspace-navigation.js';
import {resolveWorkspaceRoute} from '../public/js/workspace-registry.js';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const navCss=read('css/workspace-navigation.css');
const marketingCss=read('css/marketing.css');
const ws={account:{businessName:'XYZ',trade:'Cleaning',timeZone:'Asia/Kolkata'},leads:[],reviews:[],followUps:[],invoices:[]};

const cssBody=(css,selector)=>{
  const from=css.indexOf(selector+'{');
  assert.ok(from>=0,selector+' must exist');
  const to=css.indexOf('}',from);
  assert.ok(to>from,'CSS rule must end');
  return css.slice(from+selector.length+1,to);
};
const edgePadding=(body)=>{
  const m=/(?<!-)\bpadding:\s*(\d+)px(?:\s+(\d+)px)?/.exec(body);
  assert.ok(m,'explicit pixel padding is required');
  return m[2]===undefined?Number(m[1]):Number(m[2]);
};

test('embedded Marketing panels retain nonzero horizontal insets and a clear divider',()=>{
  const header=cssBody(navCss,'.app-page .workspace-feature-panel .marketing-feature-header');
  const body=cssBody(navCss,'.app-page .workspace-feature-panel .marketing-feature-body');
  assert.ok(edgePadding(header)>=20,'Header must not touch workspace panel edge');
  assert.ok(edgePadding(body)>=20,'Form must not touch workspace panel edge');
  assert.match(header,/border-bottom:1px solid/);
  assert.doesNotMatch(header,/padding:0 0 24px/,'Old zero-horizontal-padding override must never return');
  assert.doesNotMatch(body,/padding:28px 0 0/,'Old body edge-to-edge override must never return');
  assert.ok(edgePadding(cssBody(marketingCss,'.marketing-feature-header'))>=20);
  assert.ok(edgePadding(cssBody(marketingCss,'.marketing-feature-body'))>=20);
});

test('Marketing draft editor and recommendations have bounded, distinct surfaces',()=>{
  const grid=cssBody(navCss,'.app-page .workspace-feature-panel .marketing-feature-grid');
  assert.match(grid,/max-width:1440px/);
  assert.match(grid,/grid-template-columns:minmax\(0,1\.6fr\) minmax\(250px,\.7fr\)/);
  assert.match(grid,/margin-inline:auto/);
  const editor=cssBody(marketingCss,'.marketing-composer');
  assert.match(editor,/padding:22px 24px 20px/);
  assert.match(editor,/border:1px solid/);
  assert.match(editor,/border-radius:12px/);
  const aside=cssBody(navCss,'.app-page .workspace-feature-panel .marketing-next-moves');
  assert.ok(edgePadding(aside)>=20);
  assert.match(aside,/background:#fafbff/);
  const note=cssBody(marketingCss,'.marketing-fineprint');
  assert.match(note,/padding-top:12px/);
  assert.match(note,/border-top:1px solid/);
});

test('subfeature heading links appear as discrete accessible navigation controls',()=>{
  const links=cssBody(marketingCss,'.marketing-page .marketing-panel-links .marketing-link');
  assert.match(links,/display:inline-flex/);
  assert.match(links,/border:1px solid/);
  assert.match(links,/min-height:34px/);
  assert.match(links,/background:#f7f5fc/);
  const html=renderFeatureWorkspace(resolveWorkspaceRoute('#marketing/visibility'),undefined,renderMarketingPage(ws,{embedded:true}),ws);
  for(const label of ['Get found and chosen','Review requests','Your enquiries','Message draft','Recommended actions']){
    assert.ok(html.includes(label),label);
  }
  assert.ok(html.includes('class="panel-header marketing-feature-header"'));
  assert.ok(html.includes('class="panel-body marketing-feature-body"'));
  assert.ok(html.includes('data-marketing-generate'));
  assert.ok(html.includes('data-marketing-copy'));
  assert.ok(html.includes('data-marketing-draft'));
  assert.ok(html.includes('data-marketing-copy-status'));
  assert.match(html,/href="#reviews"/);
  assert.match(html,/href="#leads"/);
});

test('narrow layouts preserve inset spacing without horizontal form overflow',()=>{
  assert.match(navCss,/@container workspace-feature \(max-width:820px\)/);
  assert.match(navCss,/@container workspace-feature \(max-width:520px\)/);
  const narrow=navCss.slice(navCss.indexOf('@container workspace-feature (max-width:520px)'));
  assert.match(narrow,/\.marketing-feature-header\{padding:17px\}/);
  assert.match(narrow,/\.marketing-feature-body\{padding:18px 15px 22px\}/);
  assert.match(narrow,/\.marketing-composer,\.app-page \.workspace-feature-panel \.marketing-next-moves\{padding:17px\}/);
  assert.match(marketingCss,/@media\(max-width:680px\)/);
  assert.match(marketingCss,/@media\(prefers-reduced-motion:reduce\)/);
});

test('privacy, persistence boundaries and Marketing data actions stay unchanged',()=>{
  const ui=read('js/marketing-page.js');
  assert.match(ui,/No messages are sent automatically/);
  assert.match(ui,/data-marketing-generate/);
  assert.match(ui,/navigator\.clipboard\.writeText/);
  assert.match(ui,/api\.createFollowUp/);
  assert.doesNotMatch(ui,/api\.sendCampaign|api\.publishPost|api\.bulkText/);
  const midnight=read('css/workspace-midnight.css');
  assert.doesNotMatch(midnight,/\.app-page \.marketing-main/);
});
