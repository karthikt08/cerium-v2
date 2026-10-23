import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openDb} from '../server/db.js';

test('Quotes migration initializes idempotently without changing existing Jobs/Invoices schema',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cerium-quotes-'));
  const file=path.join(root,'cerium.db');
  try{
    let db=openDb(file);
    try{
      const raw=db.rawDb;
      const beforeJobs=raw.prepare('PRAGMA table_info(jobs)').all().map(x=>x.name);
      const beforeInvoices=raw.prepare('PRAGMA table_info(invoices)').all().map(x=>x.name);
      const quoteCols=raw.prepare('PRAGMA table_info(quotes)').all().map(x=>x.name);
      for(const key of ['id','user_id','lead_id','job_id','items_json','total_cents','status','sent_at'])
        assert.ok(quoteCols.includes(key),key);
      assert.ok(beforeJobs.includes('billable_items_json'));
      assert.ok(beforeInvoices.includes('job_id'));
      const index=raw.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='quotes_owner_created'").get();
      assert.ok(index);
    }finally{db.close();}
    db=openDb(file);
    try{
      assert.equal(db.rawDb.prepare("SELECT COUNT(*) AS n FROM quotes").get().n,0);
      assert.equal(db.rawDb.pragma('foreign_keys',{simple:true}),1);
      assert.ok(db.ping());
    }finally{db.close();}
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
