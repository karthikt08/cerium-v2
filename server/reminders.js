import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';

export class ReminderError extends Error {
  constructor(code,message,status=400){super(message);this.code=code;this.status=status;}
}
const cleanEmail=value=>{
  if(typeof value!=='string')return '';
  const email=value.trim().toLowerCase();
  return email.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
};
const out=r=>({
  id:r.id,invoiceId:r.invoice_id,email:r.email,status:r.status,
  dueAt:new Date(r.due_at).toISOString(),createdAt:new Date(r.created_at).toISOString(),
  sentAt:r.sent_at?new Date(r.sent_at).toISOString():null,error:r.last_error||'',
});

export function signOptOut({userId,email},secret){
  const data=Buffer.from(JSON.stringify({u:userId,e:email})).toString('base64url');
  const signature=createHmac('sha256',secret).update('cerium:unsubscribe:v1:'+data).digest('base64url');
  return data+'.'+signature;
}
export function verifyOptOut(token,secret){
  if(typeof token!=='string'||token.length>1024||!(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/).test(token))return null;
  const parts=token.split('.');
  if(parts.length!==2)return null;
  const expected=createHmac('sha256',secret).update('cerium:unsubscribe:v1:'+parts[0]).digest();
  let incoming;
  try{incoming=Buffer.from(parts[1],'base64url');}catch{return null;}
  if(incoming.length!==expected.length||!timingSafeEqual(incoming,expected))return null;
  try{
    const p=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
    if(typeof p.u!=='string'||p.u.length>100||!cleanEmail(p.e))return null;
    return {userId:p.u,email:cleanEmail(p.e)};
  }catch{return null;}
}

export function createReminderStore(db){
  db.exec("CREATE TABLE IF NOT EXISTS email_reminders ("+
    "id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,"+
    "invoice_id TEXT NOT NULL, email TEXT NOT NULL,"+
    "due_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled' "+
    "CHECK(status IN ('scheduled','sending','sent','cancelled','skipped','review')),"+
    "created_at INTEGER NOT NULL, claimed_at INTEGER, sent_at INTEGER, last_error TEXT,"+
    "UNIQUE(user_id,invoice_id));"+
    "CREATE INDEX IF NOT EXISTS reminders_due ON email_reminders(status,due_at);"+
    "CREATE INDEX IF NOT EXISTS reminders_owner ON email_reminders(user_id,created_at);"+
    "CREATE TABLE IF NOT EXISTS email_optouts ("+
    "user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,email TEXT NOT NULL,"+
    "created_at INTEGER NOT NULL,PRIMARY KEY(user_id,email));");
  if(!db.prepare('PRAGMA table_info(email_reminders)').all().some(c=>c.name==='template_json'))db.exec("ALTER TABLE email_reminders ADD COLUMN template_json TEXT");
  const q={
    invoice:db.prepare('SELECT id,customer_name,customer_email,job_title,status,total,due_date,invoice_currency FROM invoices WHERE id=? AND user_id=?'),
    user:db.prepare('SELECT name,business_name,email,plan_status,trial_started_at,trial_days_total,trial_ends_at,subscription_expires_at FROM users WHERE id=?'),
    list:db.prepare('SELECT * FROM email_reminders WHERE user_id=? ORDER BY due_at DESC LIMIT 250'),
    get:db.prepare('SELECT * FROM email_reminders WHERE id=? AND user_id=?'),
    byInvoice:db.prepare('SELECT * FROM email_reminders WHERE user_id=? AND invoice_id=?'),
    create:db.prepare("INSERT INTO email_reminders(id,user_id,invoice_id,email,due_at,status,created_at) VALUES(?,?,?,?,?,'scheduled',?)"),
    cancel:db.prepare("UPDATE email_reminders SET status='cancelled' WHERE id=? AND user_id=? AND status IN ('scheduled','review')"),
    due:db.prepare("SELECT * FROM email_reminders WHERE status='scheduled' AND due_at<=? ORDER BY due_at ASC LIMIT ?"),
    attemptsSince:db.prepare('SELECT COUNT(*) AS n FROM email_reminders WHERE claimed_at>=?'),
    claim:db.prepare("UPDATE email_reminders SET status='sending',claimed_at=?,last_error=NULL WHERE id=? AND status='scheduled'"),
    stale:db.prepare("UPDATE email_reminders SET status='review',last_error='Delivery outcome unknown after interruption. Review before any resending.' WHERE status='sending' AND claimed_at<?"),
    finish:db.prepare("UPDATE email_reminders SET status=?,sent_at=?,last_error=? WHERE id=? AND status='sending'"),
    cancelForInvoice:db.prepare("UPDATE email_reminders SET status='skipped',last_error=? WHERE invoice_id=? AND user_id=? AND status='sending'"),
    isOptedOut:db.prepare('SELECT 1 FROM email_optouts WHERE user_id=? AND email=?'),
    optOut:db.prepare('INSERT OR IGNORE INTO email_optouts(user_id,email,created_at) VALUES(?,?,?)'),
    cancelEmail:db.prepare("UPDATE email_reminders SET status='cancelled',last_error='Recipient unsubscribed' WHERE user_id=? AND email=? AND status='scheduled'"),
    clear:db.prepare('DELETE FROM email_reminders WHERE user_id=?'),
    clearOptouts:db.prepare('DELETE FROM email_optouts WHERE user_id=?'),
    getOptouts:db.prepare('SELECT email,created_at FROM email_optouts WHERE user_id=? ORDER BY created_at DESC LIMIT 200'),
  };
  return {
    listReminders(userId){return q.list.all(userId).map(out);},
    listEmailOptouts(userId){return q.getOptouts.all(userId).map(r=>({email:r.email,createdAt:new Date(r.created_at).toISOString()}));},
    createReminder(userId,p,now=Date.now()){
      if(!p||typeof p!=='object'||Array.isArray(p))throw new ReminderError('invalid_reminder','Invalid reminder details.');
      if(p.consentConfirmed!==true||p.approved!==true)
        throw new ReminderError('consent_required','Confirm recipient consent and explicitly approve this reminder.');
      const invoiceId=String(p.invoiceId||'');
      if(!/^\d{1,20}$/.test(invoiceId))throw new ReminderError('invalid_invoice','Choose a valid invoice.');
      if(typeof p.dueAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(p.dueAt))
        throw new ReminderError('invalid_schedule','Schedule the reminder in UTC ISO format.');
      const due=Date.parse(p.dueAt);
      const canonical=p.dueAt.includes('.')?p.dueAt:p.dueAt.slice(0,-1)+'.000Z';
      if(!Number.isFinite(due)||new Date(due).toISOString()!==canonical||due<now-60000||due>now+180*86400000)
        throw new ReminderError('invalid_schedule','Choose a time in the next 180 days.');
      return db.transaction(()=>{
        const invoice=q.invoice.get(invoiceId,userId);
        if(!invoice)throw new ReminderError('not_found','Invoice not found in your workspace.',404);
        if(invoice.status!=='Sent'&&invoice.status!=='Overdue')
          throw new ReminderError('invoice_not_sent','Mark the invoice as Sent before scheduling a reminder.',409);
        if(!(Number(invoice.total)>0))throw new ReminderError('invalid_invoice','An invoice with no amount cannot be reminded.');
        const email=cleanEmail(invoice.customer_email);
        if(!email)throw new ReminderError('missing_email','Add a valid customer email to the invoice.');
        if(q.isOptedOut.get(userId,email))throw new ReminderError('recipient_unsubscribed','This recipient opted out of reminders.',409);
        if(q.byInvoice.get(userId,invoiceId))
          throw new ReminderError('already_scheduled','A reminder already exists for this invoice.',409);
        const id=randomUUID();
        let template=null;
        if(p.templateId){
          const record=db.prepare("SELECT data_json FROM operation_records WHERE id=? AND user_id=? AND kind='templates'").get(p.templateId,userId);
          if(!record)throw new ReminderError('invalid_template','Choose a saved template from your workspace.');
          template=record.data_json;
        }
        q.create.run(id,userId,invoiceId,email,due,now);
        if(template)db.prepare('UPDATE email_reminders SET template_json=? WHERE id=?').run(template,id);
        return out(q.get.get(id,userId));
      })();
    },
    cancelReminder(userId,id){
      if(!q.get.get(id,userId))throw new ReminderError('not_found','Reminder not found.',404);
      if(!q.cancel.run(id,userId).changes)
        throw new ReminderError('not_cancellable','This reminder is already sending or finished.',409);
      return {ok:true};
    },
    optOut(userId,email,now=Date.now()){
      const clean=cleanEmail(email);
      if(!clean)throw new ReminderError('invalid_email','Invalid email.');
      return db.transaction(()=>{
        const user=q.user.get(userId);
        if(!user)throw new ReminderError('not_found','Workspace not found.',404);
        q.optOut.run(userId,clean,now);
        q.cancelEmail.run(userId,clean);
        return {ok:true};
      })();
    },
    recoverInterruptedReminders(now=Date.now(),ttlMs=15*60_000){
      return q.stale.run(now-ttlMs).changes;
    },
    claimDueReminders(now=Date.now(),limit=5){
      const capped=Math.max(1,Math.min(10,Number(limit)||5));
      return db.transaction(()=>{
        // Safety cap well below advertised OCI free allowances. These values do
        // not override account-specific provider limits or guarantee free sending.
        const today=new Date(now);today.setUTCHours(0,0,0,0);
        const month=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),1));
        const todayUsed=q.attemptsSince.get(today.getTime()).n;
        const monthUsed=q.attemptsSince.get(month.getTime()).n;
        const available=Math.max(0,Math.min(capped,50-todayUsed,1500-monthUsed));
        const claimed=[];
        if(!available)return claimed;
        for(const reminder of q.due.all(now,available)){
          if(q.claim.run(now,reminder.id).changes)claimed.push({...reminder,claimed_at:now});
        }
        return claimed;
      })();
    },
    assessReminder(r,now=Date.now()){
      const invoice=q.invoice.get(r.invoice_id,r.user_id);
      const user=q.user.get(r.user_id);
      if(!invoice||!user)return {eligible:false,reason:'Invoice or workspace was deleted.'};
      if(cleanEmail(invoice.customer_email)!==r.email)return {eligible:false,reason:'Invoice customer email changed.'};
      if(invoice.status!=='Sent'&&invoice.status!=='Overdue')
        return {eligible:false,reason:'Invoice is no longer marked as sent and unpaid.'};
      if(!(Number(invoice.total)>0))return {eligible:false,reason:'Invoice amount must be positive.'};
      if(q.isOptedOut.get(r.user_id,r.email))return {eligible:false,reason:'Recipient unsubscribed.'};
      const subscriptionExpired=user.plan_status==='active'&&user.subscription_expires_at&&user.subscription_expires_at<=now;
      const trialExpired=user.plan_status==='trial'&&(user.trial_ends_at>0
        ? now>=user.trial_ends_at
        : user.trial_started_at&&(Math.floor((now-Date.parse(user.trial_started_at+'T00:00:00Z'))/86400000)>=Number(user.trial_days_total||15)));
      if(user.plan_status==='expired'||subscriptionExpired||trialExpired)
        return {eligible:false,reason:'Workspace subscription/trial expired.'};
      return {eligible:true,recipient:r.email,invoice,
        businessName:user.business_name||user.name||'Your contractor',
        senderReplyTo:cleanEmail(user.email)||null};
    },
    completeReminder(id,{status,now=Date.now(),error=''}) {
      if(!['sent','review','skipped'].includes(status))throw new ReminderError('invalid_state','Invalid delivery state.');
      return q.finish.run(status,status==='sent'?now:null,String(error).slice(0,250),id).changes;
    },
    clearReminderData(userId){
      q.clear.run(userId);
      q.clearOptouts.run(userId);
    },
  };
}
