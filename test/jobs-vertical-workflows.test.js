import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer,signIn,ALICE,BOB} from './helpers.js';
import {VERTICAL_WORKFLOWS} from '../public/js/vertical-workflows.js';

test('trade service reports persist, patch, export, validate and remain tenant-owned',async()=>{
  const t=await startServer();
  try {
    const a=t.browser(),b=t.browser();
    await signIn(t,a,{profile:ALICE});await signIn(t,b,{profile:BOB});
    const ac=(await a.me()).csrfToken,bc=(await b.me()).csrfToken;
    const A=async(path,method='GET',json)=>{const r=await a.req(path,{method,json,csrf:ac});return {status:r.status,data:await r.json()};};
    const B=async(path,method='GET',json)=>{const r=await b.req(path,{method,json,csrf:bc});return {status:r.status,data:await r.json()};};
    const input={
      title:'Heat pump service',customerName:'Morgan',
      startAt:'2026-11-20T09:00',endAt:'2026-11-20T10:00',
      verticalWorkflow:{
        industry:'hvac',serviceType:VERTICAL_WORKFLOWS.hvac.types[1],
        values:{equipment:'Heat pump',serial:'AC-7788',readings:'Supply 13 C, return 25 C'},
        checks:{site:'done',filters:'done',coil:'na'},
        nextVisit:'2027-05-20',workNotes:'Recommend filter review in six months.'
      }
    };
    const made=await A('/api/jobs','POST',input);
    assert.equal(made.status,201);
    assert.equal(made.data.verticalWorkflow.values.serial,'AC-7788');
    assert.equal(made.data.verticalWorkflow.checks.coil,'na');
    const id=made.data.id;
    assert.equal((await B('/api/jobs/'+id,'PATCH',{verticalWorkflow:null})).status,404);
    const patched=await A('/api/jobs/'+id,'PATCH',{verticalWorkflow:{
      ...made.data.verticalWorkflow,nextVisit:'2027-11-20',checks:{...made.data.verticalWorkflow.checks,operation:'done'}
    }});
    assert.equal(patched.status,200);
    assert.equal(patched.data.verticalWorkflow.nextVisit,'2027-11-20');
    assert.equal((await A('/api/workspace')).data.jobs.find(j=>j.id===id).verticalWorkflow.checks.operation,'done');
    assert.equal((await A('/api/me/export')).data.workspace.jobs.find(j=>j.id===id).verticalWorkflow.values.serial,'AC-7788');
    assert.equal((await B('/api/workspace')).data.jobs.length,0);
    assert.equal((await A('/api/jobs/'+id,'PATCH',{verticalWorkflow:{industry:'hvac',serviceType:'Invalid'}})).status,400);
    assert.equal((await A('/api/jobs/'+id,'PATCH',{verticalWorkflow:{industry:'hvac',serviceType:VERTICAL_WORKFLOWS.hvac.types[0],values:{equipment:'X'.repeat(161)}}})).status,400);
    const without=await A('/api/jobs','POST',{...input,startAt:'2026-11-21T09:00',endAt:'2026-11-21T10:00',verticalWorkflow:undefined});
    assert.equal(without.status,201);
    assert.equal(without.data.verticalWorkflow,null);
    const general=await A('/api/jobs/'+id,'PATCH',{verticalWorkflow:null});
    assert.equal(general.status,200);
    assert.equal(general.data.verticalWorkflow,null);
  }finally{await t.close();}
});
