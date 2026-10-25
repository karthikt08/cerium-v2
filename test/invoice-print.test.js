import test from 'node:test';
import assert from 'node:assert/strict';
import {invoicePrintHTML} from '../public/js/invoice-print.js';

const invoice='<article class="invoice-document"><div class="table-scroll"><table><thead><tr><th>Description</th></tr></thead><tbody><tr><td>Work done</td></tr></tbody></table></div></article>';

test('invoice PDF presentation is isolated from workspace responsive CSS',()=>{
  const html=invoicePrintHTML({invoiceMarkup:invoice,paper:'A4',title:'Invoice INV-1'});
  assert.match(html,/@page\{size:A4;margin:16mm/);
  assert.match(html,/counter\(page\).*counter\(pages\)/);
  assert.match(html,/\.invoice-document \.table-scroll\{overflow:visible!important;height:auto!important;max-height:none!important\}/);
  assert.match(html,/\.invoice-document thead\{display:table-header-group\}/);
  assert.match(html,/\.invoice-document tr\{page-break-inside:avoid/);
  assert.match(html,/\.print-toolbar\{display:none!important\}/);
  assert.match(html,/<title>Invoice INV-1<\/title>/);
  assert.ok(html.includes(invoice));
  assert.ok(!html.includes('workspace.css'));
});

test('Letter paper and title metadata are safely generated',()=>{
  const html=invoicePrintHTML({invoiceMarkup:invoice,paper:'Letter',title:'Acme <script>doBad()</script>'});
  assert.match(html,/@page\{size:Letter;margin:16mm/);
  assert.ok(!html.includes('<script>'));
  assert.match(html,/Acme &lt;script&gt;/);
});

test('untrusted non-invoice HTML is not accepted',()=>{
  assert.throws(()=>invoicePrintHTML({invoiceMarkup:'<script>alert(1)</script>'}),TypeError);
  assert.throws(()=>invoicePrintHTML(),TypeError);
});
