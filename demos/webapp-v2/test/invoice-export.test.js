'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function exporter() {
 const blobs=[], revoked=[];
 const nodes={
  'invoice-preview-body':{innerHTML:''},
  'invoice-download-link':{},
  'invoice-preview-modal':{open:false,showModal(){this.open=true;},querySelector(){return null;}}
 };
 const context={window:{},Date,console,URL:{createObjectURL:blob=>{blobs.push(blob);return 'blob:test-'+blobs.length;},revokeObjectURL:url=>revoked.push(url)},Blob,
  document:{readyState:'loading',addEventListener(){},getElementById:id=>nodes[id]||null}};
 vm.createContext(context);
 vm.runInContext(fs.readFileSync(require.resolve('../js/api.js'),'utf8'),context);
 const app=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
 vm.runInContext(app.replace(/\}\)\(\);\s*$/, 'window.__exportTest={state:AppState,open:openInvoicePreviewModal};\n})();'),context);
 const hooks=context.window.__exportTest;
 hooks.state.workspace={account:{businessName:'QA <script>alert(1)</script> & Co',currency:'USD',email:'qa@example.com'},invoices:[{
  id:'1044',customerName:'Customer <img src=x onerror=alert(1)>',customerEmail:'customer@example.com',jobTitle:'Roof & flashing',
  issueDate:'2026-10-22',dueDate:'2026-11-06',terms:'Net 15',status:'Sent',
  items:[{description:'Copper <b>flashing</b>',qty:1.005,rate:1}],total:1.01,amountPaid:.21,balance:.8,notes:'Use <safe> text & keep it literal.'
 }]};
 return {open:()=>hooks.open('1044'),nodes,blobs,revoked};
}

test('invoice HTML export retains accurate line totals, payments and balance with safe customer text',async()=>{
 const x=exporter();x.open();const html=await x.blobs[0].text();
 assert.equal(x.blobs[0].type,'text/html');
 assert.match(html,/Line Total/);assert.match(html,/\$1\.01/);
 assert.match(html,/Payments recorded: \$0\.21/);assert.match(html,/Balance due<\/span><span>\$0\.80/);
 assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.match(html,/Customer &lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<script|<img src=x|<b>flashing<\/b>/);
 assert.match(html,/<title>Invoice #1044/);
 assert.equal(x.nodes['invoice-download-link'].download,'Cerium-Invoice-1044.html');
 assert.equal(x.nodes['invoice-preview-modal'].open,true);
});

test('opening another invoice export releases its previous temporary download URL',()=>{
 const x=exporter();x.open();x.open();assert.deepEqual(x.revoked,['blob:test-1']);
 assert.equal(x.nodes['invoice-download-link'].href,'blob:test-2');
});
