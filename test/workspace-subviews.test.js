import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subviewWorkspace,subviewCount,subviewHref} from '../public/js/workspace-subviews.js';

test('active leads include new and quoted enquiries, with read-only projections',()=>{
  const ws={leads:['New','Quoted','Booked','Done'].map((stage,id)=>({id,stage})),account:{timeZone:'Asia/Kolkata'}};
  const before=structuredClone(ws),route={id:'leads',subview:'active'};
  assert.deepEqual(subviewWorkspace(route,ws).leads.map(l=>l.stage),['New','Quoted']);
  assert.equal(subviewCount(route,ws),2);
  assert.deepEqual(ws,before);
});
test('unpaid includes both sent and overdue invoices, excluding paid and drafts',()=>{
  const ws={invoices:['Draft','Sent','Overdue','Paid'].map(status=>({status,total:20,currency:'INR'}))};
  assert.deepEqual(subviewWorkspace({id:'invoices',subview:'Sent'},ws).invoices.map(i=>i.status),['Sent','Overdue']);
});
test('due follow-ups include overdue callbacks and exclude completed tasks',()=>{
  const ws={followUps:[{dueDate:'2026-10-26'},{dueDate:'2026-10-27'},{dueDate:'2026-10-28'},{dueDate:'2026-10-26',done:true}]};
  assert.equal(subviewCount({id:'followups',subview:'Due'},ws,'2026-10-27'),2);
  assert.equal(subviewCount({id:'followups',subview:'Upcoming'},ws,'2026-10-27'),1);
});
test('assignment views omit completed and cancelled jobs requiring no assignment',()=>{
  const ws={jobs:[{id:1,status:'Scheduled',workerId:'crew1'},{id:2,status:'Confirmed'},{id:3,status:'Completed'},{id:4,status:'Cancelled'}],crew:[{id:'crew1',active:true}]};
  assert.deepEqual(subviewWorkspace({id:'assignments',subview:'unassigned'},ws).jobs.map(j=>j.id),[2]);
  assert.deepEqual(subviewWorkspace({id:'assignments',subview:'assigned'},ws).jobs.map(j=>j.id),[1]);
  assert.equal(subviewWorkspace({id:'assignments',subview:'assigned'},ws).crew,ws.crew);
});
test('subview links are allowlisted and remain stable from nested routes',()=>{
  assert.equal(subviewHref({id:'leads',href:'#customers/leads'},'board'),'#customers/leads/board');
  assert.equal(subviewHref({id:'leads',href:'#customers/leads/active',featureHref:'#customers/leads'},'list'),'#customers/leads/list');
  assert.equal(subviewHref({id:'leads',href:'#customers/leads'},'../../settings'),null);
});
