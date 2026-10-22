import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { openDb } from '../server/db.js';

test('existing invoice numbers survive migration, restart, and deletion of the latest invoice', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cerium-migration-'));
  const file = join(directory, 'workspace.sqlite');
  let db;
  try {
    db = openDb(file);
    const user = db.createUser({ email: 'migration@example.test', name: 'Migration test' });
    const invoice = db.createInvoice(user.id, { customerName: 'Existing customer', amount: 120 });
    db.close();
    // Reproduce the previous schema and a higher existing invoice identifier.
    const legacy = new Database(file);
    legacy.prepare('UPDATE invoices SET id = ? WHERE id = ?').run('3499', invoice.id);
    legacy.exec('DROP TABLE invoice_numbers');
    legacy.close();
    db = openDb(file);
    const next = db.createInvoice(user.id, { customerName: 'Next customer', amount: 50 });
    assert.equal(next.id, '3500');
    db.deleteInvoice(user.id, next.id);
    db.close();
    db = openDb(file);
    assert.equal(db.createInvoice(user.id, { customerName: 'After restart', amount: 60 }).id, '3501');
  } finally {
    db?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('invoice terms count from the chosen issue date', () => {
  const db = openDb(':memory:');
  try {
    const user = db.createUser({ email: 'dates@example.test', name: 'Date test' });
    const invoice = db.createInvoice(user.id, { customerName: 'Customer', amount: 50, issueDate: '2026-01-31', terms: 'Net 7' });
    assert.equal(invoice.dueDate, '2026-02-07');
  } finally { db.close(); }
});
