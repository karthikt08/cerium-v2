// Invoice-independent manual receivables. Recording a due is not proof of payment.
import {randomUUID} from 'node:crypto';
const invalid=message=>Object.assign(new Error(message),{code:'invalid_payment_due',status:400});
const validDate=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const d=new Date(value+'T00:00:00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
};
const amountCents=value=>{
  if(typeof value!=='number'&&typeof value!=='string')throw invalid('Enter a valid amount.');
  if(typeof value==='string'&&!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(value.trim()))throw invalid('Enter a positive amount with up to 2 decimals.');
  const n=Number(value);
  if(!Number.isFinite(n)||n<=0||n>100_000_000||Math.abs(n*100-Math.round(n*100))>0.000001)
    throw invalid('Enter a positive amount with up to 2 decimals.');
  return Math.round(n*100);
};
function validate(body){
  if(!body||typeof body!=='object'||Array.isArray(body))throw invalid('Enter valid payment due details.');
  const p={};
  for(const [key,max] of Object.entries({customerName:120,description:180,reference:100,notes:1200})){
    const raw=body[key]??'';
    if(typeof raw!=='string'||raw.trim().length>max)throw invalid(key+' must be text no longer than '+max+' characters.');
    p[key]=raw.trim();
  }
  if(!p.customerName||!p.description)throw invalid('Enter a customer and a description for this due.');
  if(!validDate(body.dueDate))throw invalid('Enter a valid due date.');
  p.dueDate=body.dueDate;
  p.amountCents=amountCents(body.amount);
  return p;
}
const toRecord=r=>({
  id:r.id,customerName:r.customer_name,description:r.description,
  amount:Number((r.amount_cents/100).toFixed(2)),currency:r.currency,
  dueDate:r.due_date,reference:r.reference||'',notes:r.notes||'',
  status:r.status,settledAt:r.settled_at||null,createdAt:r.created_at
});
export function createPaymentDuesStore(db){
  db.exec([
    "CREATE TABLE IF NOT EXISTS payment_dues(",
    "id TEXT PRIMARY KEY,user_id TEXT NOT NULL,customer_name TEXT NOT NULL,description TEXT NOT NULL,",
    "amount_cents INTEGER NOT NULL CHECK(amount_cents>0),currency TEXT NOT NULL,due_date TEXT NOT NULL,",
    "reference TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',",
    "status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','Settled')),",
    "settled_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);",
    "CREATE INDEX IF NOT EXISTS payment_dues_by_owner ON payment_dues(user_id,due_date,status);"
  ].join(' '));
  const get=db.prepare('SELECT * FROM payment_dues WHERE user_id=? AND id=?');
  const list=db.prepare("SELECT * FROM payment_dues WHERE user_id=? ORDER BY (status = 'Settled'),due_date ASC,created_at DESC");
  const create=db.prepare("INSERT INTO payment_dues(id,user_id,customer_name,description,amount_cents,currency,due_date,reference,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)");
  const edit=db.prepare("UPDATE payment_dues SET customer_name=?,description=?,amount_cents=?,due_date=?,reference=?,notes=?,updated_at=? WHERE user_id=? AND id=?");
  const status=db.prepare('UPDATE payment_dues SET status=?,settled_at=?,updated_at=? WHERE user_id=? AND id=?');
  const del=db.prepare('DELETE FROM payment_dues WHERE user_id=? AND id=?');
  const clear=db.prepare('DELETE FROM payment_dues WHERE user_id=?');
  const owner=db.prepare('SELECT currency FROM users WHERE id=?');
  const requireOwn=(userId,id)=>{
    const item=get.get(userId,String(id));
    if(!item)throw Object.assign(new Error('Payment due not found.'),{code:'payment_due_not_found',status:404});
    return item;
  };
  const stamp=()=>new Date().toISOString();
  return {
    listPaymentDues(userId){return list.all(userId).map(toRecord);},
    createPaymentDue(userId,body){
      const p=validate(body),account=owner.get(userId);
      if(!account)throw Object.assign(new Error('Workspace not found.'),{status:404,code:'workspace_not_found'});
      const id=randomUUID(),at=stamp();
      create.run(id,userId,p.customerName,p.description,p.amountCents,account.currency||'USD',p.dueDate,p.reference,p.notes,at,at);
      return toRecord(requireOwn(userId,id));
    },
    updatePaymentDue(userId,id,body){
      requireOwn(userId,id);
      const p=validate(body);
      edit.run(p.customerName,p.description,p.amountCents,p.dueDate,p.reference,p.notes,stamp(),userId,String(id));
      return toRecord(requireOwn(userId,id));
    },
    setPaymentDueStatus(userId,id,body){
      const old=requireOwn(userId,id);
      if(!body||!['Open','Settled'].includes(body.status)||body.confirmed!==true)
        throw invalid('Confirm the recorded payment status before making this change.');
      const at=stamp();
      status.run(body.status,body.status==='Settled'?(old.settled_at||at):null,at,userId,String(id));
      return toRecord(requireOwn(userId,id));
    },
    deletePaymentDue(userId,id){
      requireOwn(userId,id);
      del.run(userId,String(id));
      return {ok:true};
    },
    importPaymentDueRows(userId,rows,commit=false){
      if(!Array.isArray(rows)||rows.length>2000)throw invalid('Import at most 2,000 payment dues at a time.');
      return db.transaction(()=>{
        const account=owner.get(userId);
        if(!account)throw Object.assign(new Error('Workspace not found.'),{code:'workspace_not_found',status:404});
        const currency=account.currency||'USD';
        const fingerprint=p=>[
          p.customerName.trim().toLocaleLowerCase().replace(/\s+/g,' '),
          p.description.trim().toLocaleLowerCase().replace(/\s+/g,' '),
          p.amountCents,p.dueDate,p.reference.trim().toLocaleLowerCase()
        ].join('\u001f');
        const known=new Set(list.all(userId).map(x=>fingerprint({
          customerName:x.customer_name,description:x.description,
          amountCents:x.amount_cents,dueDate:x.due_date,reference:x.reference||''
        })));
        let ready=0,duplicates=0,invalid=0,imported=0;
        const samples=[],errors=[];
        for(const row of rows){
          const number=Number(row?.number)||0;
          const messages=Array.isArray(row?.errors)?[...row.errors]:[];
          let p;
          if(!messages.length)try{p=validate(row.data);}catch(e){messages.push(e.message);}
          let status='ready',reason='';
          if(messages.length){
            invalid++;status='invalid';reason=messages.join(' ');
            if(errors.length<100)errors.push({row:number,reason});
          }else{
            const key=fingerprint(p);
            if(known.has(key)){duplicates++;status='duplicate';reason='This due already exists or repeats a row in this file.';}
            else{
              ready++;known.add(key);
              if(commit){
                const id=randomUUID(),at=stamp();
                create.run(id,userId,p.customerName,p.description,p.amountCents,currency,p.dueDate,p.reference,p.notes,at,at);
                imported++;
              }
            }
          }
          if(samples.length<20)samples.push({row:number,customerName:String(row?.data?.customerName||''),
            description:String(row?.data?.description||''),amount:String(row?.data?.amount||''),
            dueDate:String(row?.data?.dueDate||''),status,reason});
        }
        return {total:rows.length,ready,duplicates,invalid,imported,samples,errors};
      })();
    },
    clearPaymentDues(userId){clear.run(userId);}
  };
}
