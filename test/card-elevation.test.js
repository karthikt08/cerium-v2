import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const css=read('css/workspace-vibrance.css');
const app=read('app.html');

test('card shadows are part of the existing workspace skin, not the public website',()=>{
  assert.equal((app.match(/css\/workspace-vibrance\.css/g)||[]).length,1);
  assert.match(css,/--cerium-card-shadow:/);
  assert.match(css,/--cerium-card-shadow-hover:/);
  assert.match(css,/box-shadow:var\(--cerium-card-shadow\)/);
  assert.match(css,/box-shadow:var\(--cerium-card-shadow-hover\)/);
  assert.match(css,/\.app-page #page-body/,'keep all elevated surfaces inside the active workspace');
  for(const page of ['index.html','pricing.html','benefits.html','verify.html']){
    assert.doesNotMatch(read(page),/workspace-vibrance\.css/,'do not change public surfaces: '+page);
  }
});

test('elevation reaches operational and dashboard cards without repainting controls',()=>{
  const styles=css.slice(css.indexOf('/* Card elevation'),css.indexOf('/* Put the branded color emphasis'));
  for(const selector of [
    '.metric','.panel','.quote-card','.jobs-stat','.jobs-panel',
    '.lead-card','.marketing-stat','.quotes-summary>div','.reminders-stats>div',
    '.workspace-feature-panel',
  ])assert.ok(styles.includes(selector),'missing card family: '+selector);
  assert.match(styles,/0 15px 31px -17px rgba\(42,61,111,\.28\)/,'subtle, neutral middle shadow');
  assert.match(styles,/0 28px 51px -36px rgba\(102,81,176,\.22\)/,'restrained lavender depth');
  assert.doesNotMatch(styles,/\.button|\.icon-button|\.data-table|\.invoice-document|\.sidebar/,'do not modify interaction semantics, tables, sidebar or printable invoices');
  assert.doesNotMatch(styles,/transform:|translate:|position:/,'avoid extra movement and stacking contexts');
});

test('hover depth is pointer-specific and reduced-motion and print remain plain',()=>{
  assert.match(css,/@media\(hover:hover\) and \(pointer:fine\)[\s\S]*?--cerium-card-shadow-hover/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{[\s\S]*?\.app-page #page-body :is\([\s\S]*?transition:none!important/);
  assert.match(css,/@media print\{[\s\S]*?\.app-page #page-body :is\([\s\S]*?box-shadow:none!important/);
  assert.match(css,/\.app-page #page-body \.workspace-feature-panel\{/,'large workspace canvas uses quieter depth');
});

test('cards feature tactile boundary creases, darker ink typography, and atmospheric shadow diffusion',()=>{
  assert.match(css,/inset 0 1px 0 rgba\(255,255,255,\.92\)/,'tactile top-bevel highlight crease');
  assert.match(css,/inset 0 -1px 0 rgba\(15,23,42,\.02\)/,'crisp inner bottom crease');
  assert.match(css,/0 0 0 1px rgba\(118,74,211,\.15\)/,'hover focus aura perimeter');
  const workspace=read('css/workspace.css');
  assert.match(workspace,/--ink:#0f172a;/,'darker high-contrast primary ink');
  assert.match(workspace,/--mut:#475569;/,'crisp secondary muted text');
  assert.match(workspace,/\.board-column\{background:#f5f7fb;border:1px solid #e2e8f0/,'board column boundary crease');
});
