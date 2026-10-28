import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../public/' + path, import.meta.url), 'utf8');
const pages = [
  'index.html',
  'benefits.html',
  'pricing.html',
  'about.html',
  'contact.html',
  'signup.html',
  'login.html',
  'terms.html',
  'privacy.html'
];

test('every marketing page provides signature animated hand-drawn underlines', () => {
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /<svg\s+class="ul"/, page + ' must feature the animated SVG underline');
    assert.match(html, /class="ac(?:-wrap|\b)/, page + ' must feature the accent brand gradient');
  }
});

test('every marketing page provides staggered hero entrance animations with complete keyframes', () => {
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /\b(?:ey|eyebrow)\b[^>]*\bu\b|\bclass="[^"]*\bu\b[^"]*"/, page + ' must apply .u entrance animations');
    assert.match(html, /@keyframes up\s*\{\s*from\s*\{[^}]*\}\s*to\s*\{[^}]*opacity:\s*1/i, page + ' must define complete @keyframes up transition');
  }
});

test('spatial skin supplies card hover underlines and live beacon pulse to all pages', () => {
  const spatial = read('css/spatial.css');
  assert.match(spatial, /\.pg \.ey::before::after/, 'live pulsing indicator dot is active');
  assert.match(spatial, /@keyframes pulse/, 'pulse keyframe exists');
  assert.match(spatial, /\.pg \.feature h3::after/, 'feature cards inherit hover underline animation');
  assert.match(spatial, /\.pg \.pcard h3::after/, 'pricing cards inherit hover underline animation');
  assert.match(spatial, /\.pg \.acard h2::after/, 'auth cards inherit hover underline animation');
  assert.match(spatial, /linear-gradient\(90deg,#3b5bff 0%,#7c3aed 50%,#d946ef 100%\)/, 'hover underlines use signature gradient');
  assert.match(spatial, /@media\(prefers-reduced-motion:reduce\)/, 'reduced motion safeguards exist');
});
