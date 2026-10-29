import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {WORKSPACE_CATEGORIES,WORKSPACE_FEATURES,resolveWorkspaceRoute} from '../public/js/workspace-registry.js';
import {renderFeatureWorkspace} from '../public/js/workspace-navigation.js';

const html=fs.readFileSync(new URL('../public/app.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/css/workspace-reference-theme.css',import.meta.url),'utf8');

test('reference theme loads after every existing stylesheet and keeps the sidebar markup',()=>{
  const link='css/workspace-reference-theme.css';
  assert.equal(html.split(link).length-1,1);
  assert.ok(html.indexOf(link)>html.indexOf('css/typography.css'));
  assert.match(html,/family=Inter:wght@400;500;600;700/);
  assert.match(html,/<aside class="sidebar" id="sidebar" aria-label="Main navigation">/);
  assert.match(html,/id="sidebar-collapse-toggle"/);
  assert.match(html,/id="category-navigation"/);
  assert.match(html,/id="utility-navigation"/);
  // Keep all rules scoped to work-area surfaces; the reference must not
  // replace the existing sidebar or root application layout.
  const nonCommentRules=css.replace(/\/\*[\s\S]*?\*\//g,'');
  assert.doesNotMatch(nonCommentRules,/(?:^|[,}\s])(?:\.app-page\s+)?\.(?:sidebar|brand|workspace\.sidebar-collapsed)\s*\{/m);
  assert.doesNotMatch(nonCommentRules,/\.sidebar\s+\./);
});

test('reference design palette and side-bracket states apply with horizontal overflow',()=>{
  for(const color of ['#1d5bf0','#0e1c3a','#16213a','#e3e8f1','#fafbfe','#e7ecf5','#eaf1ff'])
    assert.ok(css.includes(color),'Missing palette color '+color);
  assert.match(css,/\.workspace-feature-tab\.active::before/);
  assert.match(css,/\.workspace-subfeature-tab\.active::before/);
  assert.match(css,/border-bottom-color:var\(--reference-blue\)/);
  assert.match(css,/overflow-x:auto/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/@media print/);
  assert.match(css,/\.workspace-angular-navigation\+\.workspace-feature-panel/);
});

test('every workspace category preserves real routes and one or two-tier navigation',()=>{
  for(const category of WORKSPACE_CATEGORIES){
    for(const feature of WORKSPACE_FEATURES.filter(f=>f.category===category.id)){
      const route=resolveWorkspaceRoute(feature.href);
      const content='<p>Content and controls remain here</p>';
      const rendered=renderFeatureWorkspace(route,undefined,content);
      assert.ok(rendered.includes(content),feature.href);
      if(['overview','settings','assistant','support'].includes(category.id)){
        assert.equal(rendered,content,'standalone utility pages stay standalone');
      }else{
        assert.match(rendered,/workspace-angular-navigation/);
        assert.match(rendered,/workspace-feature-tab/);
        assert.match(rendered,/workspace-subfeature-tab/);
        assert.match(rendered,/workspace-feature-content/);
        assert.ok(rendered.includes('href="'+feature.href+'"'),feature.href);
      }
    }
  }
});

test('theme covers all major operational surface types without affecting invoice print rules',()=>{
  for(const selector of ['.content-scroll','.page-heading','.button.primary','.panel','.jobs-panel',
    '.data-table','.jobs-table','.quote-table','.payment-table','.report-table',
    '.metric:not(.warning)','.workspace-category-heading','dialog.dialog'])
      assert.ok(css.includes(selector),'Missing component coverage: '+selector);
  assert.match(css,/\.app-page \.content-scroll\{background:#fff!important\}/);
  assert.doesNotMatch(css,/\.invoice-document\s*\{/);
});
