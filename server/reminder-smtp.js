// Oracle Email Delivery compatible SMTP-over-TLS transport (port 465).
// Uses only Node built-ins; no persistent mail server, Redis, or paid dependency.
import tls from 'node:tls';
import {randomUUID} from 'node:crypto';

const emailOk=v=>typeof v==='string'&&v.length<=254&&/^[^\s<>"@]+@[^\s<>"@]+\.[^\s<>"@]+$/.test(v);
const mime=(value)=>'=?UTF-8?B?'+Buffer.from(value,'utf8').toString('base64')+'?=';
function wireMessage({from,to,subject,body,replyTo}){
  const domain=from.split('@')[1];
  const headers=[
    'From: '+from,
    'To: '+to,
    'Subject: '+mime(subject),
    'Date: '+new Date().toUTCString(),
    'Message-ID: <'+randomUUID()+'@'+domain+'>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ];
  if(replyTo&&emailOk(replyTo))headers.push('Reply-To: '+replyTo);
  const base64=Buffer.from(body,'utf8').toString('base64');
  const lines=base64.match(/.{1,76}/g)||[''];
  return headers.join('\r\n')+'\r\n\r\n'+lines.join('\r\n')+'\r\n';
}
export async function sendSmtp({host,port=465,user,password,from,to,subject,body,replyTo}){
  if(!host||typeof host!=='string'||!user||!password||!emailOk(from)||!emailOk(to))
    throw new Error('SMTP configuration or addresses are invalid.');
  if(Number(port)!==465)throw new Error('Only encrypted implicit-TLS SMTP port 465 is supported.');
  const socket=tls.connect({host,port:465,serverName:host,rejectUnauthorized:true});
  socket.setTimeout(15000);
  const queue=[];const waiting=[];
  let ended=false,problem=null,fragment='';
  const stop=err=>{
    ended=true;problem=err;
    for(const waiter of waiting.splice(0))waiter.reject(err);
    socket.destroy();
  };
  socket.on('timeout',()=>stop(new Error('SMTP timed out. Delivery outcome requires review.')));
  socket.on('error',stop);
  socket.on('close',()=>{if(!ended)stop(new Error('SMTP connection closed unexpectedly.'));});
  socket.on('data',data=>{
    fragment+=data.toString('utf8');
    if(fragment.length>64*1024){stop(new Error('Oversized SMTP response.'));return;}
    let index;
    while((index=fragment.indexOf('\n'))>=0){
      const line=fragment.slice(0,index).replace(/\r$/,'');fragment=fragment.slice(index+1);
      const waiter=waiting.shift();if(waiter)waiter.resolve(line);else queue.push(line);
    }
  });
  const readLine=()=>{
    if(queue.length)return Promise.resolve(queue.shift());
    if(ended)return Promise.reject(problem||new Error('SMTP disconnected.'));
    return new Promise((resolve,reject)=>waiting.push({resolve,reject}));
  };
  const response=async (expected)=>{
    let line;let code;
    do {
      line=await readLine();
      if(!/^\d{3}[ -]/.test(line))throw new Error('Malformed SMTP response.');
      code=Number(line.slice(0,3));
    }while(line[3]==='-');
    if(code!==expected)throw new Error('SMTP rejected message with status '+code+'.');
  };
  const command=async(str,expected)=>{
    if(!socket.writable)throw new Error('SMTP connection unavailable.');
    socket.write(str+'\r\n');await response(expected);
  };
  try{
    await new Promise((resolve,reject)=>{
      if(socket.authorized&&socket.encrypted)return resolve();
      socket.once('secureConnect',resolve);
      socket.once('error',reject);
    });
    await response(220);
    await command('EHLO cerium.local',250);
    await command('AUTH PLAIN '+Buffer.from('\u0000'+user+'\u0000'+password).toString('base64'),235);
    await command('MAIL FROM:<'+from+'>',250);
    await command('RCPT TO:<'+to+'>',250);
    await command('DATA',354);
    const data=wireMessage({from,to,subject,body,replyTo});
    // MIME content is base64 and cannot contain SMTP's <CRLF>.<CRLF> sequence.
    socket.write(data+'.\r\n');
    await response(250);
    try{socket.write('QUIT\r\n');}catch{}
    return {accepted:true};
  }finally{socket.destroy();}
}

export function buildReminderEmail({businessName,invoice,recipient,unsubscribeUrl}){
  const name=String(businessName||'Your service provider').replace(/[\r\n]+/g,' ').slice(0,90);
  const customer=String(invoice.customer_name||'customer').replace(/[\r\n]+/g,' ').slice(0,90);
  return {
    to:recipient,
    subject:'Payment reminder for invoice #'+invoice.id,
    body:'Hello '+customer+',\n\n'+
      'This is a friendly payment reminder from '+name+' regarding invoice #'+invoice.id+
      ' ('+invoice.job_title+'), due '+invoice.due_date+'.\n\n'+
      'If you have already paid, please disregard this message. For invoice questions, reply to your service provider.\n\n'+
      'To stop automated CERIUM payment reminders from this business, visit:\n'+unsubscribeUrl+
      '\n\n'+name,
  };
}
