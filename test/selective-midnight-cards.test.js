import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const css=read('css/workspace-midnight.css');
const shell=read('css/workspace.css');
const overview=read('css/workspace-overview-unified.css');
const app=read('app.html');

function luminance(color){
  const rgb=color.replace('#','').match(/../g).map(pair=>parseInt(pair,16)/255)
    .map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
}
function contrast(first,second){
  const [a,b]=[luminance(first),luminance(second)].sort((x,y)=>y-x);
  return (a+.05)/(b+.05);
}

test('the default Cerium app remains light and the overview header remains separately dark',()=>{
  assert.match(shell,/:root\{color-scheme:light/);
  assert.match(shell,/\.panel\{[^}]*background:#ffffffeb/);
  assert.match(overview,/\.overview-stage\.overview-stage-unified\{/);
  assert.doesNotMatch(css,/color-scheme\s*:\s*dark\b/);
  assert.doesNotMatch(css,/--(?:ink|mut|line|surface|cerium-ui-primary)\s*:/);
  assert.doesNotMatch(css,/\.app-page\s*\{/,'do not override global app tokens');
  assert.doesNotMatch(css,/\.app-page\s+\.sidebar\b/);
  assert.doesNotMatch(css,/\.app-page\s+\.main-frame\b/);
  assert.doesNotMatch(css,/\.app-page\s+\.topbar\b/);
  assert.doesNotMatch(css,/\.app-page\s+:is\([^)]*\.panel/,'do not darken all panels');
  assert.match(css,/@media screen \{/);
  const styles=[...app.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(x=>x[1]);
  assert.deepEqual(styles.slice(-2),['css/workspace-midnight.css','css/typography.css']);
});

test('exactly the chosen summary cards receive a midnight paint, not full categories',()=>{
  const highlights=[
    '.metrics-grid>.metric:nth-child(3)',
    '.jobs-stats>.jobs-stat:first-child',
    '.quotes-summary>div:first-child',
    '.reminders-stats>div:first-child',
    '.report-stats>.report-stat:first-child',
    '.marketing-insight-grid>.marketing-stat:first-child'
  ];
  for(const marker of highlights)assert.ok(css.includes(marker),'missing selective card '+marker);
  for(const unsafe of [
    '.sidebar','.main-frame','.topbar','.dialog','.invoice-document',
    '.data-table','.quote-card','.lead-card','.marketing-main','.jobs-panel',
    '.reminders-columns','.settings-grid'
  ])assert.ok(!css.includes('.app-page '+unsafe),'unsafe global surface '+unsafe);
  assert.match(css,/linear-gradient\(135deg,#202b55 0%,#151a27 48%,#10131a 100%\)/);
  assert.match(css,/\.metrics-grid>\.metric:nth-child\(3\) \.metric-value/);
  assert.match(css,/\.report-stats>\.report-stat:first-child :is\(span,small\)/);
  assert.match(css,/\.marketing-insight-grid>\.marketing-stat:first-child>strong/);
});

test('selected card values, labels and notes pass minimum contrast on navy and charcoal',()=>{
  for(const background of ['#202b55','#151a27','#10131a']){
    assert.ok(contrast('#f6f7ff',background)>=7,'large values readable on '+background);
    assert.ok(contrast('#d1dbee',background)>=4.5,'small labels readable on '+background);
  }
  assert.match(css,/\.metric-top \.icon \{\s*color:#c5b8ff;/);
  assert.match(css,/\.metric-foot \.dot \{\s*background:#b8b2ff;/);
  assert.match(css,/focus-visible/);
});

test('financial documents and dense controls are not touched by dark card accents',()=>{
  for(const path of ['css/workspace-midnight.css']){
    const source=read(path);
    assert.doesNotMatch(source,/\.invoice-document\b|\.dialog-header\b|\.record-form\b|\.data-table\b|\.navigation-scroll\b/);
    assert.doesNotMatch(source,/@media print/,'only screen CSS should paint selected cards');
    assert.doesNotMatch(source,/\.app-page\s+\.button\b|\.app-page\s+\.field\b/);
  }
  assert.match(read('css/workspace-vibrance.css'),/background:linear-gradient\(135deg,#fff 43%,#f8f5ff 100%\)/,
    'unselected cards keep the original light component treatment');
});
