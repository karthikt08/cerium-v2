'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../js/api.js'),'utf8');
function setup(shared = new Map()) {
  let blocked = false;
  const storage = {getItem:key=>shared.get(key)||null,setItem:(key,value)=>{if(blocked)throw new Error('quota');shared.set(key,String(value));},removeItem:key=>shared.delete(key)};
  const context = {window:{location:{}},localStorage:storage,URL,Date,setTimeout:fn=>setImmediate(fn),console};
  vm.runInNewContext(source,context);
  return {api:context.window.CeriumAPI,raw:()=>JSON.parse(shared.get('cerium_demo_v2')),write:state=>shared.set('cerium_demo_v2',JSON.stringify(state)),setRaw:raw=>shared.set('cerium_demo_v2',raw),block:()=>{blocked=true;},shared};
}
const lead = (extra={})=>({name:'QA Customer',phone:'555-0100',email:'qa@example.com',notes:'Repair roof',value:50,...extra});
const invoice = (extra={})=>({customerName:'QA Customer',jobTitle:'Roof repair',amount:100,terms:'Net 15',...extra});

test('seed loads all work areas and computed balances without re-saving on every read',async()=>{
 const x=setup(),s=await x.api.getWorkspace(); assert.equal(s.leads.length,8);assert.ok(s.followUps.length); assert.ok(s.invoices.length); assert.ok(s.reviews.length);const raw=x.shared.get('cerium_demo_v2');await x.api.getWorkspace();assert.equal(x.shared.get('cerium_demo_v2'),raw);assert.equal(s.invoices.find(i=>i.status==='Paid').balance,0);
});
test('new lead and reminder are saved together',async()=>{const {api}=setup();const l=await api.createLead(lead());const s=await api.getWorkspace();assert.equal(s.leads[0].id,l.id);assert.equal(s.followUps[0].leadId,l.id);assert.equal(s.followUps[0].contactName,l.name);});
test('completed new lead queues a review without a callback',async()=>{const {api}=setup();const l=await api.createLead(lead({stage:'Done'}));const s=await api.getWorkspace();assert.equal(s.followUps.filter(f=>f.leadId===l.id).length,0);assert.equal(s.reviews.filter(r=>r.leadId===l.id).length,1);});
test('lead updates preserve fields and IDs and do not duplicate queued reviews',async()=>{const {api}=setup();const l=await api.createLead(lead());const u=await api.updateLead(l.id,{stage:'Done',id:'malicious'});assert.equal(u.name,l.name);assert.equal(u.id,l.id);assert.equal((await api.getWorkspace()).followUps.find(f=>f.leadId===l.id).done,true);await api.updateLead(l.id,{stage:'Done'});await api.updateLead(l.id,{stage:'New'});await api.updateLead(l.id,{stage:'Done'});assert.equal((await api.getWorkspace()).reviews.filter(r=>r.leadId===l.id).length,1);});
test('same customer can have distinct completed jobs',async()=>{const {api}=setup();const a=await api.createLead(lead({stage:'Done'}));const b=await api.createLead(lead({stage:'Done'}));const s=await api.getWorkspace();assert.ok(s.reviews.some(r=>r.leadId===a.id));assert.ok(s.reviews.some(r=>r.leadId===b.id));});
test('deleting latest lead does not reuse its ID or relink old callbacks',async()=>{const {api}=setup();const a=await api.createLead(lead());await api.deleteLead(a.id);const b=await api.createLead(lead());assert.notEqual(b.id,a.id);assert.equal((await api.getWorkspace()).followUps.filter(f=>f.leadId===a.id).length,0);});
test('empty names, invalid email, invalid stage, negative/NaN amounts and impossible dates are rejected',async()=>{const {api}=setup();for(const bad of [{name:'  '},{email:'bad'},{stage:'Lost'},{value:-1},{value:Infinity},{nextFollowUp:'2026-02-30'}])await assert.rejects(api.createLead(lead(bad)));});
test('failed persistence does not report success or corrupt previous records',async()=>{const x=setup();await x.api.getWorkspace();const before=x.shared.get('cerium_demo_v2');x.block();await assert.rejects(x.api.createLead(lead()),/could not be saved/);assert.equal(x.shared.get('cerium_demo_v2'),before);assert.equal((await x.api.getWorkspace()).leads.length,8);});
test('malformed saved JSON remains untouched for recovery',async()=>{const x=setup();x.setRaw('{broken');await assert.rejects(x.api.getWorkspace(),/cannot be read/);assert.equal(x.shared.get('cerium_demo_v2'),'{broken');});
test('damaged records and missing collections fail visibly without replacing them',async()=>{const x=setup();await x.api.getWorkspace();const s=x.raw();s.invoices=[null];x.write(s);const before=x.shared.get('cerium_demo_v2');await assert.rejects(x.api.getWorkspace(),/invalid record/);assert.equal(x.shared.get('cerium_demo_v2'),before);delete s.leads;x.write(s);await assert.rejects(x.api.getWorkspace(),/missing leads/);});
test('two API instances read fresh storage before changes',async()=>{const shared=new Map();const a=setup(shared),b=setup(shared);await a.api.getWorkspace();await b.api.getWorkspace();await a.api.createLead(lead({name:'First tab'}));await b.api.createLead(lead({name:'Second tab'}));const s=await a.api.getWorkspace();assert.ok(s.leads.some(l=>l.name==='First tab'));assert.ok(s.leads.some(l=>l.name==='Second tab'));});
test('concurrent creates keep every record and allocate distinct IDs',async()=>{const {api}=setup();const result=await Promise.all(Array.from({length:100},(_,i)=>api.createLead(lead({name:'Stress '+i,createReminder:false}))));assert.equal(new Set(result.map(l=>l.id)).size,100);assert.equal((await api.getWorkspace()).leads.length,108);});
test('partial follow-up updates do not erase customer or task',async()=>{const {api}=setup();const f=await api.createFollowUp({contactName:'A',task:'Call after quote',phone:'555-0100',dueDate:'2026-12-01'});const u=await api.updateFollowUp(f.id,{dueDate:'2026-12-02'});assert.equal(u.contactName,'A');assert.equal(u.task,'Call after quote');assert.equal((await api.toggleFollowUp(f.id)).done,true);assert.equal((await api.toggleFollowUp(f.id)).done,false);});
test('invoice terms use issue date, including due on receipt',async()=>{const {api}=setup();const i=await api.createInvoice(invoice({issueDate:'2026-01-10',terms:'Net 30'}));assert.equal(i.dueDate,'2026-02-09');const j=await api.createInvoice(invoice({issueDate:'2026-01-10',terms:'Due on receipt'}));assert.equal(j.dueDate,'2026-01-10');});
test('invoice total is rounded per line in cents, and zero quantity is not treated as one',async()=>{const {api}=setup();assert.equal(api.computeInvoiceTotal({items:[{qty:3,rate:.1},{qty:1,rate:.2}]}),.5);assert.equal(api.computeInvoiceTotal({items:[{qty:0,rate:10}]}),0);for(const bad of [{amount:0},{amount:-1},{amount:Infinity},{terms:'Net 999'},{items:[{description:'A',qty:0,rate:10}]}]) await assert.rejects(api.createInvoice(invoice(bad)));});
test('partial invoice edits preserve customer, notes, line items and issued date',async()=>{const {api}=setup();const i=await api.createInvoice(invoice({notes:'Keep me',customerEmail:'qa@example.com'}));const u=await api.updateInvoice(i.id,{terms:'Net 30'});assert.equal(u.notes,'Keep me');assert.equal(u.customerEmail,'qa@example.com');assert.equal(u.items[0].rate,100);assert.equal(u.issueDate,i.issueDate);});
test('multi-item amount cannot silently overwrite original detail',async()=>{const {api}=setup();const i=await api.createInvoice(invoice({items:[{description:'A',qty:2,rate:10},{description:'B',qty:1,rate:20}]}));await assert.rejects(api.updateInvoice(i.id,{amount:100}),/individual line items/);assert.equal((await api.getWorkspace()).invoices.find(j=>j.id===i.id).total,40);});
test('manually marking paid and reopening clears stale payment date',async()=>{const {api}=setup();const i=await api.createInvoice(invoice());const paid=await api.updateInvoiceStatus(i.id,'Paid');assert.equal(paid.balance,0);assert.ok(paid.paidAt);const open=await api.updateInvoiceStatus(i.id,'Sent');assert.equal(open.balance,100);assert.equal(open.paidAt,undefined);});
test('exact bank match pays invoice only once and undo restores balance',async()=>{const {api}=setup();let r=await api.resolveBankMatch('TX-901','confirm','1043');assert.equal(r.invoice.balance,0);assert.equal(r.invoice.status,'Paid');await assert.rejects(api.resolveBankMatch('TX-901','confirm','1043'),/already processed/);r=await api.resolveBankMatch('TX-901','unmatch');assert.equal(r.invoice.balance,2110);assert.notEqual(r.invoice.status,'Paid');});
test('partial payment leaves correct balance and never marks full payment',async()=>{const x=setup();const i=await x.api.createInvoice(invoice({amount:5000}));const s=x.raw();s.bankTransactions.unshift({id:'TX-950',amount:2000,description:'Partial',date:x.api.todayStr(),status:'pending_match',suggestedInvoiceId:i.id});x.write(s);const r=await x.api.resolveBankMatch('TX-950','confirm',i.id);assert.equal(r.invoice.balance,3000);assert.equal(r.invoice.amountPaid,2000);assert.notEqual(r.invoice.status,'Paid');});
test('bad invoice, overpayment, draft, paid invoice, and unknown bank action reject atomically',async()=>{const x=setup();await x.api.getWorkspace();let before=x.shared.get('cerium_demo_v2');for(const args of [['TX-901','confirm','missing'],['TX-901','confirm','1040'],['TX-901','confirm','1042'],['TX-901','confirm','1039'],['TX-901','hack']]){await assert.rejects(x.api.resolveBankMatch(...args));assert.equal(x.shared.get('cerium_demo_v2'),before);}});
test('reopening matched paid invoice requires undo, and deletion detaches transactions',async()=>{const {api}=setup();await api.resolveBankMatch('TX-901','confirm','1043');await assert.rejects(api.updateInvoiceStatus('1043','Sent'),/Undo the bank match/);await api.deleteInvoice('1043');const tx=(await api.getWorkspace()).bankTransactions.find(t=>t.id==='TX-901');assert.equal(tx.suggestedInvoiceId,null);assert.equal(tx.status,'pending_match');});
test('unmatched simulated deposits never invent an invoice reference',async()=>{const {api}=setup();await api.deleteWorkspaceData();const t=await api.simulateIncomingPayment();assert.equal(t.suggestedInvoiceId,null);await assert.rejects(api.resolveBankMatch(t.id,'confirm'));});
test('review completion does not fabricate a rating or testimonial',async()=>{const {api}=setup();const r=await api.createReviewRequest({customerName:'A',jobTitle:'Roof'});assert.equal(r.status,'Not Asked');const u=await api.markReviewReceived(r.id);assert.equal(u.status,'Reviewed');assert.equal(u.rating,null);assert.equal(u.reviewSnippet,'');await assert.rejects(api.sendReviewRequest(r.id));});
test('review partial edits preserve contacts, request tracking is explicit',async()=>{const {api}=setup();const r=await api.createReviewRequest({customerName:'A',customerEmail:'a@example.com',jobTitle:'Roof'});const u=await api.updateReview(r.id,{jobTitle:'Updated roof'});assert.equal(u.customerEmail,'a@example.com');assert.equal((await api.sendReviewRequest(r.id)).status,'Sent');assert.equal((await api.sendReviewRequest(r.id)).status,'Reminded');});
test('unsafe review links and invalid currencies are rejected; profile fields preserved',async()=>{const {api}=setup();for(const url of ['javascript:alert(1)','http://example.com','https://user:pass@example.com','broken'])await assert.rejects(api.updateAccount({googlePlaceUrl:url}));await assert.rejects(api.updateAccount({currency:'XYZ'}));const acc=await api.updateAccount({name:'Updated'});assert.equal(acc.businessName,'Apex Roofing & Construction');assert.equal((await api.updateAccount({googlePlaceUrl:'https://example.com/review'})).googlePlaceUrl,'https://example.com/review');});
test('currency changes cannot relabel existing financial records',async()=>{const {api}=setup();await assert.rejects(api.updateAccount({currency:'INR'}),/cannot be converted/);await api.deleteWorkspaceData();assert.equal((await api.updateAccount({currency:'INR'})).currency,'INR');});
test('cleared collections remain empty after reload; counters remain monotonic',async()=>{const x=setup();const i=await x.api.createInvoice(invoice());await x.api.deleteWorkspaceData();const y=setup(x.shared);const s=await y.api.getWorkspace();for(const key of ['leads','followUps','invoices','bankTransactions','reviews','messages'])assert.equal(s[key].length,0);const j=await y.api.createInvoice(invoice());assert.ok(Number(j.id)>Number(i.id));});
test('exports are independent objects and reset produces sample workspace',async()=>{const {api}=setup();const exported=await api.exportMyData();exported.leads.length=0;assert.equal((await api.getWorkspace()).leads.length,8);await api.deleteWorkspaceData();api.resetDemoData();assert.equal((await api.getWorkspace()).leads.length,8);});
test('demo has no actual sign-in or payment verification',async()=>{const {api}=setup();assert.equal((await api.getMe()).signedIn,false);assert.equal((await api.createBillingOrder()).demo,true);await assert.rejects(api.verifyBillingPayment({}),/not supported/);assert.equal((await api.simulateTestPayment()).demo,true);});

test('every follow-up channel offered by the form can be saved and edited',async()=>{
 const {api}=setup();
 const html=fs.readFileSync(require.resolve('../app.html'),'utf8');
 const select=html.match(/<select id="nfu-channel"[\s\S]*?<\/select>/)[0];
 for(const [,channel] of select.matchAll(/<option value="([^"]+)"/g)){
  const f=await api.createFollowUp({contactName:'Site check',phone:'555-0100',task:'Inspect roof',channel});
  assert.equal(f.channel,channel);
  assert.equal((await api.updateFollowUp(f.id,{task:'Inspect flashing'})).channel,channel);
 }
});
test('editing a paid invoice never invents an additional payment',async()=>{
 const {api}=setup();
 const i=await api.createInvoice(invoice({amount:100,status:'Paid'}));
 const changed=await api.updateInvoice(i.id,{amount:150,status:'Paid',notes:'Additional work'});
 assert.equal(changed.amountPaid,100);assert.equal(changed.balance,50);assert.equal(changed.status,'Sent');
});
test('bank payments survive total edits and undo without changing the deposit amount',async()=>{
 const x=setup();const i=await x.api.createInvoice(invoice({amount:100}));
 const s=x.raw();s.bankTransactions.push({id:'TX-990',amount:100,description:'QA deposit',date:x.api.todayStr(),status:'pending_match',suggestedInvoiceId:i.id});x.write(s);
 await x.api.resolveBankMatch('TX-990','confirm',i.id);
 const changed=await x.api.updateInvoice(i.id,{amount:150,status:'Paid'});
 assert.equal(changed.amountPaid,100);assert.equal(changed.balance,50);
 const undo=await x.api.resolveBankMatch('TX-990','unmatch');assert.equal(undo.invoice.amountPaid,0);assert.equal(undo.invoice.balance,150);
});
test('editing notes with the displayed total preserves detailed single line items',async()=>{
 const {api}=setup();const i=await api.createInvoice(invoice({items:[{description:'Custom copper flashing, 2 units',qty:2,rate:50}]}));
 const changed=await api.updateInvoice(i.id,{amount:100,notes:'Updated notes',status:'Sent'});
 assert.deepEqual(JSON.parse(JSON.stringify(changed.items)),JSON.parse(JSON.stringify(i.items)));
 await assert.rejects(api.updateInvoice(i.id,{amount:110}),/line items/);
});
test('half-cent values round consistently in rates and fractional quantities',async()=>{
 const {api}=setup();
 assert.equal((await api.createInvoice(invoice({amount:1.005}))).total,1.01);
 assert.equal((await api.createInvoice(invoice({amount:10.075}))).total,10.08);
 assert.equal(api.computeInvoiceTotal({items:[{qty:1.005,rate:1},{qty:1,rate:1}]}),2.01);
});
