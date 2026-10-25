import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSpreadsheet,mappedLeads,suggestedMapping} from '../server/spreadsheet-import.js';
import {startServer,signIn,ALICE,BOB} from './helpers.js';

const csv=source=>({filename:'clients.csv',content:Buffer.from(source).toString('base64')});
// Minimal uncompressed OpenXML ZIP fixture: small enough for cross-platform Node tests.
function xlsx(parts){
  const local=[],central=[];let offset=0;
  for(const [name,source] of Object.entries(parts)){
    const nameBytes=Buffer.from(name),data=Buffer.from(source);
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
  return {filename:'customers.xlsx',content:Buffer.concat([...local,cd,end]).toString('base64')};
}
test('CSV detects column aliases, BOM, quoted line breaks and reordered columns',()=>{
  const upload=csv('\uFEFFEmail,Customer Name,Notes,Estimated Value\npat@example.com,"Pat, LLC","call after\nMonday",1,200\n');
  const parsed=parseSpreadsheet(upload);
  // Unquoted thousand separators must not shift CSV cells; use a quoted amount.
  assert.equal(parsed.headers[1],'Customer Name');
  const mapping=suggestedMapping(parsed.headers);
  assert.equal(mapping.name,1);
  assert.equal(mapping.email,0);
  assert.equal(parsed.rows[0][1],'Pat, LLC');
  assert.equal(parsed.rows[0][2],'call after\nMonday');
});
test('XLSX imports shared and inline strings, sparse cells, and Excel follow-up dates',()=>{
  const upload=xlsx({
    'xl/sharedStrings.xml':'<sst><si><t>Customer Name</t></si><si><t>Follow-up Date</t></si><si><t>Value</t></si><si><t>Customer A</t></si></sst>',
    'xl/worksheets/sheet1.xml':'<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c><c r="D1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="s"><v>3</v></c><c r="C2"><v>46351</v></c><c r="D2"><v>123.50</v></c></row></sheetData></worksheet>'
  });
  const parsed=parseSpreadsheet(upload);
  assert.equal(parsed.headers[0],'Customer Name');
  assert.equal(parsed.headers[1],'');
  const mapped=mappedLeads(parsed,suggestedMapping(parsed.headers));
  assert.equal(mapped[0].data.name,'Customer A');
  assert.match(mapped[0].data.nextFollowUp,/^2026-/);
  assert.equal(mapped[0].data.value,'123.50');
});
test('rejects malformed files and duplicate or missing mappings',()=>{
  assert.throws(()=>parseSpreadsheet(csv('Customer Name\n')),/header row/);
  assert.throws(()=>parseSpreadsheet({filename:'bad.xlsx',content:Buffer.from('fake').toString('base64')}),/valid .xlsx/);
  assert.throws(()=>parseSpreadsheet({filename:'old.xls',content:'aGVsbG8='}),/Choose a/);
  const parsed=parseSpreadsheet(csv('Name,Email\nCustomer A,a@example.com\n'));
  assert.throws(()=>mappedLeads(parsed,{name:0,email:0}),/cannot be mapped twice/);
  assert.throws(()=>mappedLeads(parsed,{name:null}),/Map a customer/);
});
test('preview is side-effect free and import is atomic, idempotent and owner-scoped',async()=>{
  const t=await startServer();try{
    const a=t.browser(),b=t.browser();
    await signIn(t,a,{profile:ALICE});await signIn(t,b,{profile:BOB});
    const ca=(await a.me()).csrfToken;
    const data=csv('Customer Name,Email,Stage,Value,Follow-up Date\nAvery,avery@example.com,New,500.25,2026-11-04\nBen,ben@example.com,Done,100,\nBad,bad-mail,New,20,\nAvery clone,avery@example.com,New,100,\n');
    const call=(path,csrf=ca)=>a.req(path,{method:'POST',csrf,json:data});
    const before=await call('/api/import/leads/preview');
    assert.equal(before.status,200,await before.clone().text());
    const pre=await before.json();
    assert.deepEqual([pre.ready,pre.duplicates,pre.invalid],[2,1,1]);
    assert.equal((await (await a.req('/api/workspace')).json()).leads.length,0);
    assert.equal((await (await b.req('/api/workspace')).json()).leads.length,0);
    const imported=await call('/api/import/leads/commit');
    assert.equal(imported.status,200,await imported.clone().text());
    const result=await imported.json();
    assert.equal(result.imported,2);
    const ws=await (await a.req('/api/workspace')).json();
    assert.equal(ws.leads.length,2);
    assert.equal(ws.followUps.length,0,'historical leads must not schedule reminders');
    assert.equal(ws.reviews.length,0,'completed historical leads must not schedule reviews');
    assert.equal(ws.leads.find(x=>x.name==='Avery').value,500.25);
    assert.equal((await (await b.req('/api/workspace')).json()).leads.length,0);
    assert.equal((await (await call('/api/import/leads/commit')).json()).imported,0);
    assert.equal((await (await a.req('/api/workspace')).json()).leads.length,2);
    const unauth=await a.req('/api/import/leads/commit',{method:'POST',json:data});
    assert.equal(unauth.status,403,'CSRF protection');
    const wrongOrigin=await a.req('/api/import/leads/commit',{method:'POST',csrf:ca,origin:'https://evil.invalid',json:data});
    assert.equal(wrongOrigin.status,403);
    t.db.setUserPlan((await a.me()).user.id,{plan:'expired',planStatus:'expired'});
    assert.equal((await call('/api/import/leads/commit')).status,403,'expired trials cannot import');
  }finally{await t.close();}
});
test('rejected mapping never modifies leads',async()=>{
  const t=await startServer();try{
    const b=t.browser();await signIn(t,b,{profile:ALICE});
    const csrf=(await b.me()).csrfToken;
    const res=await b.req('/api/import/leads/commit',{method:'POST',csrf,json:{...csv('Name,Email\nSomeone,someone@example.com\n'),mapping:{name:0,email:0}}});
    assert.equal(res.status,400);
    assert.equal((await (await b.req('/api/workspace')).json()).leads.length,0);
  }finally{await t.close();}
});
