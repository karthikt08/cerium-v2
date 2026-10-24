import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import tls from 'node:tls';
import {sendSmtp,wireMessage} from '../server/reminder-smtp.js';

test('long Unicode subjects fold into bounded, independently decodable MIME words',()=>{
  const subject='CERIUM — Payment reminder ₹ 💡 '.repeat(12);
  const msg=wireMessage({from:'sender@example.com',to:'customer@example.com',subject,body:'Hello'});
  const header=msg.split('\r\n').filter(line=>line.startsWith('Subject: ')||line.startsWith(' '));
  assert.ok(header.length>1);
  for(const line of header)assert.ok(line.length<=76);
  const words=header.join('').match(/=\?UTF-8\?B\?[^?]*\?=/g);
  assert.ok(words.every(w=>w.length<=75));
  const decoded=words.map(w=>Buffer.from(w.slice(10,-2),'base64').toString('utf8')).join('');
  assert.equal(decoded,subject);assert.ok(!decoded.includes('\uFFFD'));
});

test('SMTP sets TLS SNI and rejects a handshake timeout instead of hanging',async()=>{
  const socket=new EventEmitter();socket.setTimeout=()=>{};socket.destroy=()=>{};
  let options;
  const patched=mock.method(tls,'connect',value=>{options=value;queueMicrotask(()=>socket.emit('timeout'));return socket;});
  try {
    await assert.rejects(sendSmtp({host:'smtp.example.com',user:'test',password:'test',from:'sender@example.com',
      to:'customer@example.com',subject:'Test',body:'Test'}),/handshake timed out/);
    assert.equal(options.servername,'smtp.example.com');assert.equal(options.rejectUnauthorized,true);
  } finally {patched.mock.restore();}
});
