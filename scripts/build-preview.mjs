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
      name: '', businessName: '', email: '',
      phone: '', location: '', trade: '', currency: 'USD',
      country:'US',timeZone:'',usState:'',usZip:'',regionLocked:true,
      plan: 'trial', planStatus: 'trial', trialDaysRemaining: 15, googlePlaceUrl: '',
    },
    leads: [], followUps: [], invoices: [], reviews: [], bankTransactions: [], messages: [],jobs:[],crew:[],quotes:[],reminders:[],
  };
  let sequence = 10, invoiceNumber = 1000;
  const clone = value => JSON.parse(JSON.stringify(value));
  const setupKey='cerium_preview_business_setup_v1';
  let saved={},storageIssue='';
  try{saved=JSON.parse(localStorage.getItem(setupKey)||'{}');}catch{storageIssue='Your browser could not open saved business setup. Allow browser storage, then reload this preview.';}
  let country=validCountry(saved.country)?saved.country:'US',profile=saved.profile||null;
  const complete=()=>{try{return Boolean(profile?.completedAt&&validateBusinessProfile(profile,country));}catch{return false;}};
  let setup=saved.setup?.draft?.country===country&&businessSetupSteps(country).includes(saved.setup.step)?saved.setup:{step:'basics',draft:{country,name:'',businessName:'',businessEmail:'',timeZone:country==='IN'?'Asia/Kolkata':''}};
  const persist=()=>{
    try{localStorage.setItem(setupKey,JSON.stringify({country,profile,setup}));}
    catch{throw new Error('Business setup could not be saved. Enable browser storage and retry.');}
  };
  const applyProfile=()=>{
    ws.account.country=country;ws.account.currency=country==='IN'?'INR':'USD';
    if(complete())Object.assign(ws.account,profile,{email:profile.businessEmail,usZip:country==='US'?profile.businessPostalCode:'',location:profile.businessCity,businessProfile:{...profile,complete:true}});
  };
  const requireSetup=()=>{if(!complete())throw new Error('Complete required business setup before using the workspace.');};
  applyProfile();
  const record = (key, id) => {
    const value = ws[key].find(row => String(row.id) === String(id));
    if (!value) throw new Error('This demo record is no longer available.');
    return value;
  };
  const create = (key, payload) => {
    requireSetup();
    const value = { id: `DEMO-${++sequence}`, createdAt: day(0), ...payload };
    ws[key].unshift(value);
    return clone(value);
  };
  const update = (key, id, payload) => Object.assign(record(key,id),payload);
  const remove = (key, id) => { ws[key] = ws[key].filter(row => String(row.id) !== String(id)); };
  const nextDue = terms => day(terms === 'Due on receipt' ? 0 : Number(/\d+/.exec(terms)?.[0] || 15));
  const unavailable = async message => { throw new Error(message); };
  const api = {
    localBusinessSetup:true,
    async getBusinessSetup(){if(storageIssue)throw new Error(storageIssue);return clone({...setup,country,complete:complete(),countryEditable:!complete()});},
    async selectBusinessSetupCountry(value){
      if(complete()||!validCountry(value))throw new Error('Choose a supported country before completing setup.');
      const before={country,setup};country=value;setup={step:'basics',draft:{...setup.draft,country,usState:'',indiaState:'',gstin:'',gstRegistration:'',timeZone:country==='IN'?'Asia/Kolkata':''}};
      try{persist();}catch(err){country=before.country;setup=before.setup;throw err;}
      applyProfile();return api.getBusinessSetup();
    },
    async saveBusinessSetupStep(step,fields){
      const before=setup;setup=advanceBusinessSetup(setup,step,fields,country);
      try{persist();}catch(err){setup=before;throw err;}return api.getBusinessSetup();
    },
    async completeBusinessSetup(confirmed){
      if(setup.step!=='review'||confirmed!==true)throw new Error('Finish each step and confirm your business details.');
      const validated=validateBusinessProfile(setup.draft,country),before=profile,beforeSetup=setup;
      profile={...validated,completedAt:profile?.completedAt||Date.now()};
      setup={step:'basics',draft:{...profile}};
      try{persist();}catch(err){profile=before;setup=beforeSetup;throw err;}applyProfile();return {ok:true};
    },
    async getMe() { return { signedIn:true }; },
    async getWorkspace() { requireSetup();return clone(ws); },
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
    async updateAccount(payload) {
      requireSetup();
      const candidate={...profile,...payload,businessPostalCode:payload.usZip??profile.businessPostalCode};
      if(country==='IN'&&payload.gstin!==undefined)candidate.gstRegistration=payload.gstin?'registered':'not_registered';
      const validated=validateBusinessProfile(candidate,country),before=profile,beforeSetup=setup;
      profile={...validated,completedAt:profile.completedAt};
      setup={step:'basics',draft:{...profile}};
      try{persist();}catch(err){profile=before;setup=beforeSetup;throw err;}
      applyProfile();Object.assign(ws.account,payload);
    },
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
  window.CeriumBilling={startSubscriptionCheckout:()=>unavailable('Billing is unavailable in the demo. No payments are collected.')};
  return api;
}

let html = await read('public/app.html');
// Keep real module scopes and recursively embed their dependencies. Concatenating
// the controllers loses imports and collides on module-local names such as esc.
const modules=new Map();
async function embedModule(file){
  if(modules.has(file))return modules.get(file);
  let source=file==='api.js'?`import {businessSetupSteps,advanceBusinessSetup,validateBusinessProfile} from './business-profile.js';import {validCountry} from './countries.js';const API=(${demoAdapter.toString()})();export default API;`:await read('public/js/'+file);
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
const entryMark=(await readFile(new URL('public/img/cerium-logo-mark-blue.png',root))).toString('base64');
html=html.replace('src="img/cerium-logo-mark-blue.png"',`src="data:image/png;base64,${entryMark}"`);
html=html.replace('Personal workspace','Demo · resets on reload');
html=html.replace(/<script[\s\S]*?<\/script>/g,'');
const entryLoader='data:text/javascript;base64,'+Buffer.from(await read('public/js/entry-loader.js')).toString('base64');
html=html.replace('</body>',`<script src="${entryLoader}"></script><script type="module" src="${await embedModule('app.js')}"></script><script type="module" src="${await embedModule('workspace-cursor.js')}"></script></body>`);
const output=resolve(process.argv[2]||'output/cerium-preview.html');
await mkdir(dirname(output),{recursive:true});
await writeFile(output,html);
console.log(`Preview written: ${output}`);
