import {test} from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openDb} from '../server/db.js';

test('existing job databases migrate without losing records or invoice data',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cerium-job-migration-'));
  const file=path.join(dir,'legacy.db');
  let store;
  try {
    // An existing database created before invoice automation has neither new column.
    const old=new Database(file);
    old.exec("CREATE TABLE jobs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL,"+
      "lead_id TEXT,worker_id TEXT,title TEXT NOT NULL,customer_name TEXT NOT NULL,"+
      "customer_phone TEXT NOT NULL DEFAULT '',address TEXT NOT NULL DEFAULT '',"+
      "notes TEXT NOT NULL DEFAULT '',starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,"+
      "status TEXT NOT NULL DEFAULT 'Scheduled',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);");
    old.close();
    store=openDb(file);
    const owner=store.createUser({email:'migration@example.com',name:'Migration Test'});
    const created=store.createJob(owner.id,{title:'Annual service',customerName:'Customer',
      startAt:'2026-11-05T13:00',endAt:'2026-11-05T15:00'});
    assert.deepEqual(created.billableItems,[]);
    assert.equal(created.invoiceGenerated,false);
    store.close();store=null;
    store=openDb(file);
    const pre=store.getWorkspace(owner.id);
    assert.equal(pre.jobs.length,1);
    assert.equal(pre.invoices.length,0);
    store.updateJob(owner.id,created.id,{status:'Completed'});
    const post=store.getWorkspace(owner.id);
    assert.equal(post.jobs[0].invoiceGenerated,true);
    assert.equal(post.invoices.length,1);
    assert.equal(post.invoices[0].jobId,created.id);
    store.close();store=null;
    store=openDb(file);
    const persisted=store.getWorkspace(owner.id);
    assert.equal(persisted.invoices.length,1);
    assert.equal(persisted.jobs[0].invoiceId,persisted.invoices[0].id);
  } finally {
    store?.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

test('job email migration recovers quoted contacts once and preserves later edits',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cerium-job-email-')),file=path.join(dir,'legacy.db');
  let db;
  try{
    db=openDb(file);
    const owner=db.createUser({email:'email-migration@example.com',name:'Migration'});
    const quote=db.createQuote(owner.id,{title:'Quoted work',customerName:'Customer',customerEmail:'quoted@example.com',items:[{description:'Work',qty:1,rate:100}]});
    const secret='migration-signing-key-for-tests-only',shared=db.sendQuote(owner.id,quote.id,'https://example.test',secret);
    db.respondQuote(quote.id,new URL(shared.url).searchParams.get('token'),secret,'Accepted');
    const {job}=db.convertQuote(owner.id,quote.id,{startAt:'2026-11-12T09:00',endAt:'2026-11-12T10:00'});
    db.rawDb.exec('ALTER TABLE jobs DROP COLUMN customer_email');
    db.close();db=openDb(file);
    assert.equal(db.listJobs(owner.id)[0].customerEmail,'quoted@example.com');
    assert.equal(db.rawDb.pragma('integrity_check',{simple:true}),'ok');
    assert.deepEqual(db.rawDb.pragma('foreign_key_check'),[]);
    db.updateJob(owner.id,job.id,{customerEmail:''});
    db.close();db=openDb(file);
    assert.equal(db.listJobs(owner.id)[0].customerEmail,'');
  }finally{db?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
