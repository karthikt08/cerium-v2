import {createHmac, randomUUID, timingSafeEqual} from 'node:crypto';

// Quotes stay fully private except through a 30-day signed customer approval URL.
// No email, payment, or job is created by marking a quote "Sent".
export class QuoteError extends Error {
  constructor(code,message,status=400){super(message);this.code=code;this.status=status;}
}
const QUOTE_LIFETIME=30*86400_000;
const STR=s=>typeof s==='string'?s.trim():'';
function field(v,label,max,required=false){
  if(v!=null&&typeof v!=='string')throw new QuoteError('invalid_quote',label+' must be text.');
  const s=STR(v);
  if(s.length>max||(required&&!s))throw new QuoteError('invalid_quote',label+' must contain '+(required?'1–':'0–')+max+' characters.');
  return s;
}
const email=v=>{
  const s=field(v,'Customer email',254);
  if(s&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))throw new QuoteError('invalid_email','Enter a valid customer email.');
  return s;
};
function itemsFrom(value){
  if(!Array.isArray(value)||value.length<1||value.length>20)
    throw new QuoteError('invalid_items','Add between 1 and 20 estimate line items.');
  return value.map(it=>{
    if(!it||typeof it!=='object'||Array.isArray(it))
      throw new QuoteError('invalid_items','Each line item must contain description, quantity and rate.');
    const description=STR(it.description);
    if(typeof it.description!=='string'||!description||description.length>180)
      throw new QuoteError('invalid_items','Item description must contain 1–180 characters.');
    if(typeof it.qty!=='number'||typeof it.rate!=='number'||!Number.isFinite(it.qty)||!Number.isFinite(it.rate)||
      it.qty<=0||it.qty>10000||it.rate<0||it.rate>1000000||
      Math.abs(it.qty*100-Math.round(it.qty*100))>0.000001||
      Math.abs(it.rate*100-Math.round(it.rate*100))>0.000001)
      throw new QuoteError('invalid_items','Use positive quantities and nonnegative rates, with at most 2 decimal places.');
    return {description,qty:it.qty,rate:it.rate};
  });
}
function totalCents(items){
  const cents=items.reduce((sum,it)=>sum+Math.round(it.qty*100)*Math.round(it.rate*100)/100,0);
  const rounded=Math.round(cents);
  if(!Number.isSafeInteger(rounded)||rounded<=0||rounded>100_000_000)
    throw new QuoteError('invalid_total','Estimate total must be greater than zero and below one million.');
  return rounded;
}
function quoteOut(row){
  return {
    id:row.id,leadId:row.lead_id||null,jobId:row.job_id||null,
    customerName:row.customer_name,customerEmail:row.customer_email||'',
    customerPhone:row.customer_phone||'',address:row.address||'',
    title:row.title,notes:row.notes||'',currency:row.currency,
    items:JSON.parse(row.items_json),total:Number(row.total_cents)/100,
    status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,
    sentAt:row.sent_at||null,respondedAt:row.responded_at||null,
  };
}
function sign(row,secret){
  return createHmac('sha256',secret).update('cerium:quote:v1:'+row.id+':'+row.user_id+':'+row.sent_at).digest('base64url');
}
function safeEqualToken(expected,actual){
  if(typeof actual!=='string'||actual.length>128)return false;
  let input;
  try{input=Buffer.from(actual,'base64url');}catch{return false;}
  const known=Buffer.from(expected,'base64url');
  return input.length===known.length&&timingSafeEqual(input,known);
}
function expired(row,now){return !row.sent_at||Date.parse(row.sent_at)+QUOTE_LIFETIME<now;}
function validateQuoteInput(p,userId,q){
  if(!p||typeof p!=='object'||Array.isArray(p))throw new QuoteError('invalid_quote','Enter quote details.');
  const leadId=p.leadId||null;
  if(leadId&&(typeof leadId!=='string'||!q.lead.get(leadId,userId)))
    throw new QuoteError('invalid_lead','Choose a lead from your own workspace.');
  const items=itemsFrom(p.items);
  return {
    leadId,customerName:field(p.customerName,'Customer name',120,true),
    customerEmail:email(p.customerEmail),
    customerPhone:field(p.customerPhone,'Customer phone',40),
    address:field(p.address,'Service address',240),
    title:field(p.title,'Estimate title',120,true),
    notes:field(p.notes,'Notes',1200),
    items,totalCents:totalCents(items),
  };
}
export function createQuotesStore(db,{jobsStore}){
  db.exec(
    "CREATE TABLE IF NOT EXISTS quotes("+
    "id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,"+
    "lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,"+
    "job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,"+
    "customer_name TEXT NOT NULL,customer_email TEXT NOT NULL DEFAULT '',"+
    "customer_phone TEXT NOT NULL DEFAULT '',address TEXT NOT NULL DEFAULT '',"+
    "title TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',items_json TEXT NOT NULL,"+
    "total_cents INTEGER NOT NULL CHECK(total_cents>0),currency TEXT NOT NULL,"+
    "status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Sent','Accepted','Declined','Converted')),"+
    "created_at TEXT NOT NULL,updated_at TEXT NOT NULL,sent_at TEXT,responded_at TEXT,"+
    "UNIQUE(user_id,job_id))"+
    ";CREATE INDEX IF NOT EXISTS quotes_owner_created ON quotes(user_id,created_at DESC);"+
    "CREATE INDEX IF NOT EXISTS quotes_owner_lead ON quotes(user_id,lead_id);"
  );
  const q={
    list:db.prepare('SELECT * FROM quotes WHERE user_id=? ORDER BY created_at DESC'),
    byId:db.prepare('SELECT * FROM quotes WHERE id=? AND user_id=?'),
    byPublicId:db.prepare('SELECT * FROM quotes WHERE id=?'),
    lead:db.prepare('SELECT id FROM leads WHERE id=? AND user_id=?'),
    owner:db.prepare('SELECT business_name,name FROM users WHERE id=?'),
    insert:db.prepare('INSERT INTO quotes(id,user_id,lead_id,customer_name,customer_email,customer_phone,address,title,notes,items_json,total_cents,currency,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'+"'Draft'"+',?,?)'),
    update:db.prepare("UPDATE quotes SET lead_id=?,customer_name=?,customer_email=?,customer_phone=?,address=?,title=?,notes=?,items_json=?,total_cents=?,updated_at=? WHERE id=? AND user_id=? AND status='Draft'"),
    send:db.prepare("UPDATE quotes SET status='Sent',sent_at=?,updated_at=? WHERE id=? AND user_id=? AND status='Draft'"),
    respond:db.prepare("UPDATE quotes SET status=?,responded_at=?,updated_at=? WHERE id=? AND status='Sent'"),
    convert:db.prepare("UPDATE quotes SET status='Converted',job_id=?,updated_at=? WHERE id=? AND user_id=? AND status='Accepted'"),
    delete:db.prepare('DELETE FROM quotes WHERE id=? AND user_id=?'),
    clear:db.prepare('DELETE FROM quotes WHERE user_id=?'),
  };
  function ownerQuote(userId,id){
    const row=q.byId.get(id,userId);
    if(!row)throw new QuoteError('not_found','Estimate not found.',404);
    return row;
  }
  function authorizedPublic(id,token,secret,now){
    if(typeof secret!=='string'||secret.length<32)throw new Error('Application signing key missing.');
    if(typeof id!=='string'||id.length>80)throw new QuoteError('not_found','Estimate not found.',404);
    const row=q.byPublicId.get(id);
    if(!row||row.status==='Draft'||!safeEqualToken(sign(row,secret),token))
      throw new QuoteError('invalid_link','This estimate link is invalid.',404);
    if(expired(row,now))throw new QuoteError('link_expired','This approval link has expired. Contact the contractor for a new estimate.',410);
    return row;
  }
  return {
    listQuotes(userId){return q.list.all(userId).map(quoteOut);},
    createQuote(userId,p){
      const val=validateQuoteInput(p,userId,q),user=db.prepare('SELECT currency FROM users WHERE id=?').get(userId);
      if(!user)throw new QuoteError('not_found','Workspace not found.',404);
      const id=randomUUID(),now=new Date().toISOString(),currency=['USD','INR'].includes(user.currency)?user.currency:'USD';
      q.insert.run(id,userId,val.leadId,val.customerName,val.customerEmail,val.customerPhone,val.address,
        val.title,val.notes,JSON.stringify(val.items),val.totalCents,currency,now,now);
      return quoteOut(q.byId.get(id,userId));
    },
    updateQuote(userId,id,p){
      return db.transaction(()=>{
        const previous=ownerQuote(userId,id);
        if(previous.status!=='Draft')throw new QuoteError('quote_locked','Only draft estimates can be changed.',409);
        const v=validateQuoteInput(p,userId,q),now=new Date().toISOString();
        q.update.run(v.leadId,v.customerName,v.customerEmail,v.customerPhone,v.address,v.title,v.notes,JSON.stringify(v.items),v.totalCents,now,id,userId);
        return quoteOut(q.byId.get(id,userId));
      })();
    },
    sendQuote(userId,id,baseUrl,secret){
      return db.transaction(()=>{
        ownerQuote(userId,id);
        const at=new Date().toISOString();
        if(!q.send.run(at,at,id,userId).changes)
          throw new QuoteError('quote_locked','Only draft estimates can be marked ready for sharing.',409);
        const row=q.byId.get(id,userId);
        return {quote:quoteOut(row),url:baseUrl+'/quote/'+id+'?token='+encodeURIComponent(sign(row,secret))};
      })();
    },
    quoteLink(userId,id,baseUrl,secret,now=Date.now()){
      const row=ownerQuote(userId,id);
      if(row.status!=='Sent'&&row.status!=='Accepted')
        throw new QuoteError('quote_not_shareable','Only sent or accepted estimates have active links.',409);
      if(expired(row,now))throw new QuoteError('link_expired','The link has expired.',410);
      return {url:baseUrl+'/quote/'+id+'?token='+encodeURIComponent(sign(row,secret))};
    },
    getPublicQuote(id,token,secret,now=Date.now()){
      const row=authorizedPublic(id,token,secret,now);
      const owner=q.owner.get(row.user_id);
      const quote=quoteOut(row);
      return {quote:{
        id:quote.id,customerName:quote.customerName,title:quote.title,notes:quote.notes,
        items:quote.items,total:quote.total,currency:quote.currency,status:quote.status,
        sentAt:quote.sentAt,respondedAt:quote.respondedAt,
      },businessName:owner?.business_name||owner?.name||'Your contractor',
      expiresAt:new Date(Date.parse(row.sent_at)+QUOTE_LIFETIME).toISOString()};
    },
    respondQuote(id,token,secret,decision,now=Date.now()){
      if(!['Accepted','Declined'].includes(decision))
        throw new QuoteError('invalid_decision','Choose Accept or Decline.');
      return db.transaction(()=>{
        const row=authorizedPublic(id,token,secret,now);
        const at=new Date(now).toISOString();
        if(!q.respond.run(decision,at,at,row.id).changes)
          throw new QuoteError('quote_locked','This estimate has already been answered.',409);
        return {ok:true,status:decision};
      })();
    },
    convertQuote(userId,id,p){
      return db.transaction(()=>{
        const row=ownerQuote(userId,id);
        if(row.status!=='Accepted'||row.job_id)
          throw new QuoteError('quote_not_accepted','Only an accepted, unconverted estimate can become a job.',409);
        if(!p||typeof p!=='object'||Array.isArray(p))
          throw new QuoteError('invalid_schedule','Enter job schedule details.');
        const job=jobsStore.createJob(userId,{
          title:row.title,customerName:row.customer_name,customerPhone:row.customer_phone,
          address:row.address,notes:row.notes,startAt:p.startAt,endAt:p.endAt,
          workerId:p.workerId||null,leadId:row.lead_id||null,status:'Scheduled',
          billableItems:JSON.parse(row.items_json),
        });
        if(!q.convert.run(job.id,new Date().toISOString(),id,userId).changes)
          throw new QuoteError('quote_locked','This estimate was already converted.',409);
        return {job,quote:quoteOut(q.byId.get(id,userId))};
      })();
    },
    deleteQuote(userId,id){
      if(!q.delete.run(id,userId).changes)throw new QuoteError('not_found','Estimate not found.',404);
      return {ok:true};
    },
    clearQuotes(userId){q.clear.run(userId);},
  };
}
