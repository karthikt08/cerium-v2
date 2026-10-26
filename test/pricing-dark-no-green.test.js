import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const PUBLIC=fileURLToPath(new URL('../public/',import.meta.url));
const load=path=>readFileSync(join(PUBLIC,path),'utf8');
const skin=load('css/workspace-pricing-dark.css');

function contrast(a,b){
  function lum(hex){
    const v=hex.replace('#','').match(/.{2}/g).map(x=>parseInt(x,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
    return v[0]*.2126+v[1]*.7152+v[2]*.0722;
  }
  const vals=[lum(a),lum(b)].sort((x,y)=>y-x);
  return (vals[0]+.05)/(vals[1]+.05);
}
function greenish(r,g,b){
  const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
  if(!delta||max===0)return false;
  const h=((max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4)*60+360)%360;
  return h>=72&&h<=174&&delta/max>.12;
}
function paintCandidates(content){
  const colors=[];
  for(const match of content.matchAll(/#([a-fA-F0-9]{6})(?![a-fA-F0-9])/g)){
    const n=parseInt(match[1],16);
    if(greenish(n>>16&255,n>>8&255,n&255))colors.push('#'+match[1]);
  }
  for(const match of content.matchAll(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g)){
    if(greenish(+match[1],+match[2],+match[3]))colors.push(match[0]);
  }
  return [...new Set(colors)];
}

test('the workspace uses the actual index pricing navy and a white raised card',()=>{
  const index=load('index.html'),app=load('app.html');
  assert.match(index,/\.en\{[^}]*background:#0c1729/);
  assert.match(index,/\.pr\{[^}]*background:linear-gradient\(170deg,#ffffff/);
  assert.match(skin,/--pricing-ink:#0c1729/);
  assert.match(skin,/--pricing-light:#f9fbfd/);
  assert.match(skin,/\.app-page \.main-frame\{[\s\S]*?#0c1729/);
  assert.match(skin,/\.app-page \.sidebar\{[\s\S]*?#101b30/);
  assert.match(skin,/\.app-page \.overview-stage\{[\s\S]*?#13223a/);
  assert.match(skin,/\.app-page \.metrics-grid \.metric,[\s\S]*?background:linear-gradient\(170deg,#fff 0%,#f9fbfd 100%\)/);
  assert.match(skin,/\.app-page \.dashboard-grid>.panel/);
  const styles=[...app.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(x=>x[1]);
  assert.deepEqual(styles.slice(-3),['css/ui-consistency.css','css/workspace-pricing-dark.css','css/typography.css']);
  assert.equal(styles.filter(x=>x==='css/workspace-pricing-dark.css').length,1);
});

test('dark shell text and actionable buttons maintain accessible contrast',()=>{
  assert.ok(contrast('#f5f6ff','#0c1729')>=7,'main shell readable');
  assert.ok(contrast('#f9faff','#13223a')>=7,'overview greeting readable');
  assert.ok(contrast('#ffffff','#3b5bff')>=4.5,'blue end of the primary CTA has readable white text');
  assert.ok(contrast('#ffffff','#7c3aed')>=4.5,'violet CTA text is readable');
  assert.match(skin,/\.app-page \.breadcrumb strong\{color:#f1f2fd\}/);
  assert.match(skin,/\.app-page \.page-width>.page-heading h1/);
  assert.match(skin,/\.app-page \.marketing-tab.active::after\{/,'Marketing's real tab pseudo surface is dark');
  assert.match(skin,/\.app-page \.marketing-page-summary strong\{color:#202c47\}/,'white summary panel text remains dark');
  assert.match(skin,/@media\(max-width:760px\)/);
  assert.match(skin,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(skin,/@media print\{/);
});

test('all active user-facing CSS and HTML colors avoid visible green hues',()=>{
  const cssDir=join(PUBLIC,'css');
  const files=[
    ...readdirSync(cssDir).filter(x=>x.endsWith('.css')).map(x=>'css/'+x),
    ...readdirSync(PUBLIC).filter(x=>x.endsWith('.html'))
  ];
  assert.ok(files.length>35,'scan all public styling and pages');
  const violations=files.flatMap(file=>paintCandidates(load(file)).map(color=>file+' '+color));
  assert.deepEqual(violations,[],'no green-valued color tokens may reach users');
});

test('completed and verified states keep their labels but adopt violet or navy, not green',()=>{
  const css=load('css/workspace.css');
  const jobs=load('css/jobs.css');
  const quotes=load('css/quotes.css');
  const guide=load('css/guide-assistant.css');
  const verify=load('css/verify-phone.css');
  const home=load('index.html');
  assert.match(skin,/\.app-page \.badge.green,\.app-page \.badge.purple/);
  assert.match(jobs,/\.job-tile.green\{[^}]*#7664da/);
  assert.match(jobs,/\.job-status.green\{[^}]*#514494/);
  assert.match(quotes,/\.quote-accepted,\.quote-converted\{background:#f0edff;color:#6052ac/);
  assert.match(guide,/\.guide-status-pill\{[^}]*#f5f2ff/);
  assert.match(verify,/\.setup-steps \[data-complete=true\]\{[^}]*#f0edff/);
  assert.match(home,/\.c.g\{[^}]*#514494/);
  assert.match(css,/--green:#6859bc/,'legacy token is purple for compatibility');
  for(const file of ['login.html','signup.html']){
    const auth=load(file);
    assert.doesNotMatch(auth,/#34A853/i,'Google entry glyph is monochrome, not green');
    assert.match(auth,/<svg viewBox="0 0 48 48" aria-hidden="true">/);
  }
});

test('dark skin does not repaint invoice printouts or editor modal contents',()=>{
  assert.doesNotMatch(skin,/\.invoice-document\b|\.data-table\s+(?:tr|td|th)/,'keep operational data legible');
  assert.match(skin,/\.app-page \.page-width>.panel/);
  assert.match(skin,/\.app-page \.marketing-main/);
  assert.match(skin,/@media print\{[\s\S]*?background:#fff!important/);
  assert.match(load('app.html'),/src="js\/workspace-card-motion\.js"/,'card animations preserved');
});
