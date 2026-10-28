import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer,signIn,ALICE,BOB} from './helpers.js';
const file=(target,csv,extra={})=>({target,filename:'records.csv',content:Buffer.from(csv).toString('base64'),...extra});
test('migration previews are reversible, imports validate atomically and preserve custom fields',async()=>{
  const t=await startServer();try{
    const a=t.browser();await signIn(t,a,{profile:ALICE});const uid=(await a.me()).user.id;
    const run=(p,commit=false)=>t.db.runMigration(t.db,uid,p,commit);
    const upload=file('inventory','Inventory export\nItem name,Product code,Stock,Color\nPump,P-1,3,Blue\nValve,V-1,5,Red');
    const preview=run(upload);assert.equal(preview.headerRow,2);assert.equal(preview.ready,2);
    assert.equal(t.db.getWorkspace(uid).operations.inventory.length,0);
    assert.throws(()=>run(upload,true),/approve/);
    assert.equal(run({...upload,approved:true},true).imported,2);
    assert.equal(run(upload).duplicates,2);
    assert.equal(t.db.getWorkspace(uid).importMetadata.find(r=>r.customFields['Color [4]']==='Blue').customFields['Color [4]'],'Blue');
    const bad=file('expenses','Description,Date,Amount\nValid,2026-10-20,10\nBroken,not-a-date,40',{approved:true});
    assert.equal(run(bad).invalid,1);assert.throws(()=>run(bad,true),/cancelled/);
    assert.equal(t.db.getWorkspace(uid).operations.expenses.length,0);
    const lead=file('leads','Name,Email,Stage\nHistorical,historical@example.com,Done',{approved:true});
    assert.equal(run(lead,true).imported,1);
    const ws=t.db.getWorkspace(uid);assert.equal(ws.reviews.length,0);assert.equal(ws.followUps.length,0);
    assert.equal(run(file('leads','Name,Email\nDifferent Name,HISTORICAL@example.com')).duplicates,1);
    const job=file('jobs','Title,Customer,Start,End,Status\nOld work,Historical,2026-09-01T09:00,2026-09-01T10:00,Completed',{approved:true});
    assert.equal(run(job,true).imported,1);assert.equal(t.db.getWorkspace(uid).invoices.length,0);
    const invoice=file('invoices','Customer,Job title,Amount,Total,Issue date,Due date,Status,Paid at,Reference\nHistorical,Work,20,20,2026-09-01,2026-09-15,Paid,2026-09-10,OLD-20',{approved:true});
    assert.equal(run(invoice,true).imported,1);
    const inv=t.db.getWorkspace(uid).invoices[0];assert.equal(inv.total,20);assert.equal(inv.paidAt,'2026-09-10');
    assert.equal(run(invoice).duplicates,1);
    const distinct=file('invoices','Customer,Job title,Amount,Issue date,Due date,Reference\nSame,Work,10,2026-09-01,2026-09-15,ORDER-A\nSame,Work,10,2026-09-01,2026-09-15,ORDER-B',{approved:true});
    assert.equal(run(distinct,true).imported,2,'distinct external references preserve legitimate repeated work');
    assert.equal(run(distinct).duplicates,2);
    assert.equal(run(file('invoices','Customer,Job title,Amount,Issue date,Due date,Currency\nDifferent,Work,10,2026-09-01,2026-09-15,EUR')).invalid,1);
  }finally{await t.close();}
});
test('saved mappings and migration writes respect owner, CSRF, expiry and exports',async()=>{
  const t=await startServer();try{
    const a=t.browser(),b=t.browser();await signIn(t,a,{profile:ALICE});await signIn(t,b,{profile:BOB});
    const am=await a.me(),bm=await b.me();
    const upload=file('expenses','Cost purpose,When,Price\nFuel,2026-10-20,10',{mapping:{description:0,date:1,amount:2}});
    const preview=t.db.runMigration(t.db,am.user.id,upload);
    assert.equal(preview.ready,1);
    const saved=t.db.saveMigrationMapping(am.user.id,{name:'Supplier sheet',target:'expenses',headers:preview.headers,mapping:preview.mapping});
    assert.equal(t.db.runMigration(t.db,am.user.id,{...upload,mappingId:saved.id}).ready,1);
    assert.throws(()=>t.db.runMigration(t.db,bm.user.id,{...upload,mappingId:saved.id}),/saved mapping/);
    assert.equal((await a.req('/api/migration/commit',{method:'POST',json:{...upload,approved:true}})).status,403);
    assert.equal((await a.req('/api/migration/commit',{method:'POST',csrf:am.csrfToken,json:{...upload,approved:true}})).status,200);
    const exported=await (await a.req('/api/me/export')).json();assert.equal(exported.workspace.operations.expenses.length,1);assert.equal(exported.workspace.migrationMappings.length,1);
    t.db.setUserPlan(am.user.id,{plan:'expired',planStatus:'expired'});
    assert.equal((await a.req('/api/migration/commit',{method:'POST',csrf:am.csrfToken,json:{...upload,approved:true}})).status,403);
    t.db.clearWorkspaceData(am.user.id);assert.equal(t.db.listMigrationMappings(am.user.id).length,0);
  }finally{await t.close();}
});
