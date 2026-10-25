// Create an offline, disposable demo from the same workspace UI used in production.
// Usage: node scripts/build-preview.mjs /absolute/path/preview.html
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

function demoAdapter() {
  const day = offset => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  };
  const ws = {
    account: {
      name: 'Alex Morgan', businessName: 'Northstar Contracting', email: 'alex@example.test',
      phone: '555-0100', location: 'Austin, TX', trade: 'General contracting', currency: 'USD',
      country:'US',timeZone:'America/Chicago',regionLocked:true,
      plan: 'trial', planStatus: 'trial', trialDaysRemaining: 15, googlePlaceUrl: '',
    },
    leads: [], followUps: [], invoices: [], reviews: [], bankTransactions: [], messages: [],jobs:[],crew:[],quotes:[],reminders:[],
  };
  let sequence = 10, invoiceNumber = 1000;
  const clone = value => JSON.parse(JSON.stringify(value));
  const record = (key, id) => {
    const value = ws[key].find(row => String(row.id) === String(id));
    if (!value) throw new Error('This demo record is no longer available.');
    return value;
  };
  const create = (key, payload) => {
    const value = { id: `DEMO-${++sequence}`, createdAt: day(0), ...payload };
    ws[key].unshift(value);
    return clone(value);
  };
  const update = (key, id, payload) => Object.assign(record(key,id),payload);
  const remove = (key, id) => { ws[key] = ws[key].filter(row => String(row.id) !== String(id)); };
  const nextDue = terms => day(terms === 'Due on receipt' ? 0 : Number(/\d+/.exec(terms)?.[0] || 15));
  const unavailable = async message => { throw new Error(message); };
  const api = {
    async getMe() { return { signedIn:true }; },
    async getWorkspace() { return clone(ws); },
    async getBillingIdentity() { return {verified:false,providerReady:false}; },
    async createLead(payload) {
      const lead = create('leads', { phone:'',email:'',address:'',source:'Direct',stage:'New',value:0,notes:'',nextFollowUp:day(0),...payload });
      if (payload.createReminder) await api.createFollowUp({ contactName:lead.name,phone:lead.phone,dueDate:lead.nextFollowUp,task:`Follow up: ${lead.notes || lead.name}` });
      if (lead.stage === 'Done') create('reviews',{customerName:lead.name,customerEmail:lead.email,jobTitle:lead.notes,status:'Not Asked'});
      return lead;
    },
    async updateLead(id,payload) {
      const previous = record('leads',id).stage;
      const lead = update('leads',id,payload);
      if (payload.stage === 'Done' && previous !== 'Done') create('reviews',{customerName:lead.name,customerEmail:lead.email,jobTitle:lead.notes,status:'Not Asked'});
    },
    async deleteLead(id) { remove('leads',id); },
    async createFollowUp(payload) { return create('followUps',{contactName:'',phone:'',channel:'Call',task:'Follow up',dueDate:day(0),done:false,...payload}); },
    async updateFollowUp(id,payload) { update('followUps',id,payload); },
    async toggleFollowUp(id) { const row=record('followUps',id);row.done=!row.done; },
    async deleteFollowUp(id) { remove('followUps',id); },
    async createInvoice(payload) {
      const total=Number(payload.amount)||0;
      return create('invoices',{id:String(++invoiceNumber),customerEmail:'',customerAddress:'',notes:'Thank you for your business!',issueDate:day(0),terms:'Net 15',...payload,total,items:[{description:payload.jobTitle,qty:1,rate:total}],dueDate:payload.dueDate||nextDue(payload.terms||'Net 15'),paidAt:payload.status==='Paid'?day(0):null});
    },
    async updateInvoice(id,payload) {
      const row=update('invoices',id,payload);
      if(payload.amount!==undefined){row.total=Number(payload.amount);row.items=[{description:row.jobTitle,qty:1,rate:row.total}];}
      if(payload.terms)row.dueDate=nextDue(payload.terms);
      row.paidAt=row.status==='Paid'?day(0):null;
    },
    async updateInvoiceStatus(id,status) { update('invoices',id,{status,paidAt:status==='Paid'?day(0):null}); },
    async deleteInvoice(id) { remove('invoices',id); },
    async createReviewRequest(payload) { return create('reviews',{status:'Sent',rating:null,...payload}); },
    async updateReview(id,payload) { update('reviews',id,payload); },
    async sendReviewRequest(id) { update('reviews',id,{status:'Sent'}); },
    async markReviewReceived(id) { update('reviews',id,{status:'Reviewed'}); },
    async deleteReview(id) { remove('reviews',id); },
    async updateAccount(payload) { Object.assign(ws.account,payload); },
    async exportMyData() {
      const url=URL.createObjectURL(new Blob([JSON.stringify(ws,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download='cerium-demo-data.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    },
    async deleteWorkspaceData() { for(const key of ['leads','followUps','invoices','reviews','bankTransactions','messages'])ws[key]=[]; },
    deleteAccount:()=>unavailable('Account deletion is unavailable in this disposable demo.'),
    logout:()=>unavailable('This is a demo. Close or reload the file to end or reset it.'),
    createMessage:()=>unavailable('Support is available in the connected app. This demo does not open or send messages.'),
    resolveBankMatch:()=>unavailable('Bank connections are unavailable in this demo.'),
  };
  for(const name of ['createJob','updateJob','deleteJob','createJobInvoice','addCrew','archiveCrew',
    'createQuote','updateQuote','deleteQuote','sendQuote','quoteLink','convertQuote','createReminder','cancelReminder',
    'getBillingStatus','startBillingPhone','verifyBillingPhone','cancelSubscription','toggleBankConnection'])
    api[name]=()=>unavailable('This action requires the connected CERIUM app.');
  for (const [name,stage,source,value,notes,due] of [
    ['Olivia Ellis','New','Website Form',2400,'Kitchen cabinet refinishing',0],
    ['James Cooper','Quoted','Referral',1250,'Bathroom tile repair',0],
    ['Sophia Bennett','Booked','Google Search',3600,'Exterior painting',2],
    ['Ethan Parker','New','Google Maps',850,'Deck maintenance',0],
    ['Avery Brooks','Done','Repeat Customer',1820,'Drywall finishing',-3],
  ]) api.createLead({name,stage,source,value,notes,phone:'555-0101',email:name.split(' ')[0].toLowerCase()+'@example.test',nextFollowUp:day(due),createReminder:stage!=='Done'&&stage!=='Booked'});
  for(const [customerName,amount,jobTitle,status,due] of [
    ['Olivia Ellis',2400,'Cabinet refinishing','Sent',3],
    ['James Cooper',1250,'Bathroom finishing','Overdue',-4],
    ['Sophia Bennett',3600,'Exterior painting','Sent',8],
    ['Avery Brooks',1820,'Drywall finishing','Paid',-1],
  ]) api.createInvoice({customerName,amount,jobTitle,status,dueDate:day(due)});
  api.createReviewRequest({customerName:'Isla Turner',jobTitle:'Garden fence installation',customerEmail:'isla@example.test'});
  window.CeriumBilling={startSubscriptionCheckout:()=>unavailable('Billing is unavailable in the demo. No payments are collected.')};
  return api;
}

let html = await read('public/app.html');
// Keep real module scopes and recursively embed their dependencies. Concatenating
// the controllers loses imports and collides on module-local names such as esc.
const modules=new Map();
async function embedModule(file){
  if(modules.has(file))return modules.get(file);
  let source=file==='api.js'?`const API=(${demoAdapter.toString()})();export default API;`:await read('public/js/'+file);
  for(const match of [...source.matchAll(/(?:import|export)\s[^;]*?\sfrom\s*['"]\.\/([^'"]+)['"]/g)]){
    const dependency=await embedModule(match[1]);
    source=source.replace(match[0],match[0].replace('./'+match[1],dependency));
  }
  const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');
  modules.set(file,url);return url;
}
const logo = (await readFile(new URL('public/img/cerium-logo-30.png',root))).toString('base64');
html=html.replace(/<link[^>]+(?:favicon\.svg|fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>/g,'');
for(const match of [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="(css\/[^\"]+)"[^>]*>/g)])
  html=html.replace(match[0],`<style>${await read('public/'+match[1])}</style>`);
html=html.replace('src="img/cerium-logo-30.png"',`src="data:image/png;base64,${logo}"`);
html=html.replace('Personal workspace','Demo · resets on reload');
html=html.replace(/<script[\s\S]*?<\/script>/g,'');
html=html.replace('</body>',`<script type="module" src="${await embedModule('app.js')}"></script><script type="module" src="${await embedModule('workspace-cursor.js')}"></script></body>`);
const output=resolve(process.argv[2]||'output/cerium-preview.html');
await mkdir(dirname(output),{recursive:true});
await writeFile(output,html);
console.log(`Preview written: ${output}`);
