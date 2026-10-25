import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('brand-motion.css defines the Cerium cursor blinker skin', () => {
  const css = read('public/css/brand-motion.css');

  // Beacon pseudo-element inside magnetic cursor ring
  assert.match(css, /\.workspace-cursor::after\{[^}]*position:\s*absolute/);
  assert.match(css, /\.workspace-cursor::after\{[^}]*animation:\s*cerium-cursor-blinker/);
  assert.match(css, /--cursor-beacon:\s*var\(--accent/);

  // Breathing keyframe animation
  assert.match(css, /@keyframes cerium-cursor-blinker\s*\{/);
  assert.match(css, /transform:\s*translate\(-50%,\s*-50%\)\s*scale\(/);

  // Over control: beacon collapses and hides cleanly to keep button labels legible
  assert.match(css, /\.workspace-cursor\.over-control::after\s*\{[^}]*opacity:\s*0/);

  // Text inputs: cursor beacon suppresses and input carets receive brand color
  assert.match(css, /\.workspace-cursor\.text-input::after\s*\{[^}]*opacity:\s*0!important/);
  assert.match(css, /caret-color:\s*var\(--accent/);

  // Tactile click press state
  assert.match(css, /\.workspace-cursor\.pressed::after\s*\{[^}]*scale\(1\.3\)/);

  // Accessibility and print safety
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)[\s\S]*?\.workspace-cursor::after\{animation:none/);
  assert.match(css, /@media print[\s\S]*?\.workspace-cursor::after\{display:none!important\}/);
});

test('every public and workspace page loading workspace-cursor.js also loads brand-motion.css', () => {
  const htmlFiles = readdirSync(new URL('../public', import.meta.url))
    .filter(name => name.endsWith('.html'));

  for (const file of htmlFiles) {
    const html = read(`public/${file}`);
    if (html.includes('workspace-cursor.js')) {
      assert.ok(
        html.includes('brand-motion.css'),
        `${file} loads workspace-cursor.js but is missing brand-motion.css`
      );
    }
  }
});
