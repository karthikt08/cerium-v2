import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSpreadsheet,suggestedDueMapping,mappedDues,unmappedColumns,mappedLeads,suggestedMapping} from '../server/spreadsheet-import.js';
import {openPaymentDueImport} from '../public/js/payment-due-import-ui.js';
import {startServer,signIn,ALICE,BOB} from './helpers.js';

const csv=text=>({filename:'old-records.csv',content:Buffer.from(text).toString('base64')});
function xlsx(parts){
  const local=[],central=[];let offset=0;
  for(const [name,value] of Object.entries(parts)){
    const nameBytes=Buffer.from(name),data=Buffer.from(value);
    const a=Buffer.alloc(30);a.writeUInt32LE(0x04034b50,0);a.writeUInt16LE(20,4);
    a.writeUInt32LE(data.length,18);a.writeUInt32LE(data.length,22);a.writeUInt16LE(nameBytes.length,26);
    local.push(a,nameBytes,data);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);
    c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(nameBytes.length,28);c.writeUInt32LE(offset,42);
    central.push(c,nameBytes);offset+=a.length+nameBytes.length+data.length;
  }
  const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(Object.keys(parts).length,8);end.writeUInt16LE(Object.keys(parts).length,10);
  end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
  return {filename:'balance.xlsx',content:Buffer.concat([...local,cd,end]).toString('base64')};
}

test('Import UI can load in Node and common due columns map without column order requirements',()=>{
  assert.equal(typeof openPaymentDueImport,'function');
  const parsed=parseSpreadsheet(csv('Remarks,Due On,Party,Pending Amount,Order No,Fabric GSM\nCall next week,27/11/2026,Sunrise Fabrics,"1,200.50",PO-88,180\n'));
  const mapping=suggestedDueMapping(parsed.headers);
  assert.equal(mapping.customerName,2);
  assert.equal(mapping.amount,3);
  assert.equal(mapping.dueDate,1);
  assert.equal(mapping.notes,0);
  assert.equal(mapping.reference,4);
  assert.deepEqual(unmappedColumns(parsed,mapping).map(x=>x.header),['Fabric GSM']);
  const waiting=mappedDues(parsed,mapping,{dateFormat:'DMY',extraAction:'review'});
  assert.match(waiting[0].errors.join(' '),/unmatched column/i);
  const keep=mappedDues(parsed,mapping,{dateFormat:'DMY',extraAction:'notes'});
  assert.deepEqual(keep[0].errors,[]);
  assert.equal(keep[0].data.dueDate,'2026-11-27');
  assert.equal(keep[0].data.amount,'1200.50');
  assert.match(keep[0].data.notes,/Fabric GSM: 180/);
  const skipped=mappedDues(parsed,mapping,{dateFormat:'DMY',extraAction:'skip'});
  assert.ok(!skipped[0].data.notes.includes('GSM'));
  assert.match(mappedDues(parsed,mapping,{dateFormat:'ISO',extraAction:'notes'})[0].errors.join(' '),/Choose DD\/MM/);
});

test('Excel worksheet and header row choices do not modify existing default import behavior',()=>{
  const upload=xlsx({
    'xl/workbook.xml':'<workbook><sheets><sheet name="Leads" sheetId="1" r:id="r1"/><sheet name="Dues" sheetId="2" r:id="r2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Target="worksheets/sheet2.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml':'<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>Name</t></is></c></row><row><c r="A2" t="inlineStr"><is><t>Lead One</t></is></c></row></sheetData></worksheet>',
    'xl/worksheets/sheet2.xml':'<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>Export file</t></is></c></row><row><c r="A2" t="inlineStr"><is><t>Party</t></is></c><c r="B2" t="inlineStr"><is><t>Amount Due</t></is></c><c r="C2" t="inlineStr"><is><t>Due Date</t></is></c></row><row><c r="A3" t="inlineStr"><is><t>Sunrise</t></is></c><c r="B3"><v>125</v></c><c r="C3" t="inlineStr"><is><t>2026-11-04</t></is></c></row></sheetData></worksheet>'
  });
  assert.equal(parseSpreadsheet(upload).rows[0][0],'Lead One');
  const parsed=parseSpreadsheet({...upload,sheetIndex:1,headerRow:2});
  assert.deepEqual(parsed.sheets,['Leads','Dues']);
  assert.deepEqual(parsed.headers,['Party','Amount Due','Due Date']);
  const mapping=suggestedDueMapping(parsed.headers);
  assert.equal(mapping.customerName,0);
  assert.equal(mappedDues(parsed,mapping,{extraAction:'notes'})[0].number,3);
  assert.equal(mappedDues(parsed,mapping,{extraAction:'notes'})[0].data.amount,'125');
  assert.throws(()=>parseSpreadsheet({...upload,sheetIndex:8}),/worksheet/);
  assert.throws(()=>parseSpreadsheet({...upload,headerRow:12}),/header row/);
});

test('Lead imports no longer silently discard extra business columns',()=>{
  const parsed=parseSpreadsheet(csv('Customer,Phone,Preferred Fabric,Store Code\nClara,12005550101,Cotton,TX-201\n'));
  const mapping=suggestedMapping(parsed.headers);
  assert.deepEqual(unmappedColumns(parsed,mapping).map(x=>x.header),['Preferred Fabric','Store Code']);
  const reviewed=mappedLeads(parsed,mapping,{extraAction:'review'});
  assert.ok(reviewed[0].errors.some(x=>x.includes('unmatched')));
  const kept=mappedLeads(parsed,mapping,{extraAction:'notes'});
  assert.deepEqual(kept[0].errors,[]);
  assert.match(kept[0].data.notes,/Preferred Fabric: Cotton/);
  assert.match(kept[0].data.notes,/Store Code: TX-201/);
});

test('Due import is preview-first, idempotent and never affects invoice or bank payment totals',async()=>{
  const t=await startServer();
  try{
    const a=t.browser(),b=t.browser();
    await signIn(t,a,{profile:ALICE});await signIn(t,b,{profile:BOB});
    const csrf=(await a.me()).csrfToken;
    const upload=csv('Party,Amount Due,Due On,Order No,GSM\nSunrise,1200.50,04/11/2026,INV-1,180\nSunrise,1200.50,04/11/2026,INV-1,180\nBad,wrong,30/11/2026,INV-2,240\n');
    const body={...upload,dateFormat:'DMY',extraAction:'notes'};
    const api=(path,json=body)=>a.req(path,{method:'POST',json,csrf});
    const pre=await api('/api/import/dues/preview');
    assert.equal(pre.status,200,await pre.clone().text());
    const view=await pre.json();
    assert.deepEqual([view.ready,view.duplicates,view.invalid,view.imported],[1,1,1,0]);
    assert.deepEqual(view.extraColumns,['GSM']);
    assert.equal((await (await a.req('/api/workspace')).json()).paymentDues.length,0);
    const before=await api('/api/import/dues/commit');
    assert.equal(before.status,400,'Must explicitly confirm the workspace currency.');
    assert.equal((await api('/api/import/dues/commit',{...upload,dateFormat:'DMY',currencyConfirmed:true})).status,400,'Must review extra columns.');
    const done=await api('/api/import/dues/commit',{...body,currencyConfirmed:true});
    assert.equal(done.status,200,await done.clone().text());
    assert.equal((await done.json()).imported,1);
    const ws=await (await a.req('/api/workspace')).json();
    assert.equal(ws.paymentDues.length,1);
    assert.match(ws.paymentDues[0].notes,/GSM: 180/);
    assert.equal(ws.invoices.length,0);
    assert.equal(ws.bankTransactions.length,0);
    assert.equal((await (await b.req('/api/workspace')).json()).paymentDues.length,0);
    assert.equal((await (await api('/api/import/dues/commit',{...body,currencyConfirmed:true})).json()).imported,0,'repeated file does not duplicate debts');
    assert.equal((await (await a.req('/api/me/export')).json()).workspace.paymentDues.length,1);
    const noCsrf=await a.req('/api/import/dues/commit',{method:'POST',json:{...body,currencyConfirmed:true}});
    assert.equal(noCsrf.status,403);
    const badOrigin=await a.req('/api/import/dues/commit',{method:'POST',csrf,origin:'https://bad.invalid',json:{...body,currencyConfirmed:true}});
    assert.equal(badOrigin.status,403);
    t.db.setUserPlan((await a.me()).user.id,{plan:'expired',planStatus:'expired'});
    assert.equal((await api('/api/import/dues/commit',{...body,currencyConfirmed:true})).status,403);
  }finally{await t.close();}
});

test('Unknown lead fields require explicit review and can safely be stored in Notes',async()=>{
  const t=await startServer();
  try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});
    const csrf=(await b.me()).csrfToken;
    const upload=csv('Name,Phone,Roll No,Fabric Type\nRiver Supply,55500100,RL-11,Cotton\n');
    const preview=await b.req('/api/import/leads/preview',{method:'POST',csrf,json:upload});
    assert.equal(preview.status,200);
    const info=await preview.json();
    assert.deepEqual(info.extraColumns,['Roll No','Fabric Type']);
    assert.equal(info.ready,0);
    const blocked=await b.req('/api/import/leads/commit',{method:'POST',csrf,json:upload});
    assert.equal(blocked.status,400);
    const done=await b.req('/api/import/leads/commit',{method:'POST',csrf,json:{...upload,extraAction:'notes'}});
    assert.equal(done.status,200,await done.clone().text());
    assert.equal((await done.json()).imported,1);
    const ws=await (await b.req('/api/workspace')).json();
    assert.equal(ws.leads.length,1);
    assert.match(ws.leads[0].notes,/Roll No: RL-11/);
    assert.match(ws.leads[0].notes,/Fabric Type: Cotton/);
  }finally{await t.close();}
});
