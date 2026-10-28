import {signOptOut} from './reminders.js';
import {sendSmtp,buildReminderEmail} from './reminder-smtp.js';

// One item at a time: minimal CPU/RAM and no queue infrastructure.
// Sending is at-most-once automatically: unknown outcomes become 'review'
// instead of being retried blindly, preventing accidental duplicate emails.
export async function processDueReminders({db,send,secret,baseUrl,now=Date.now(),limit=5,log=console}){
  if(typeof send!=='function'||!secret||!/^https:\/\//.test(baseUrl))
    throw new Error('Reminder delivery requires a configured sender, secret and HTTPS BASE_URL.');
  db.recoverInterruptedReminders(now);
  const batch=db.claimDueReminders(now,limit);
  const result={claimed:batch.length,sent:0,skipped:0,review:0};
  for(const item of batch){
    const assessment=db.assessReminder(item,now);
    if(!assessment.eligible){
      db.completeReminder(item.id,{status:'skipped',now,error:assessment.reason});
      result.skipped++;
      continue;
    }
    try{
      const link=baseUrl+'/unsubscribe?token='+encodeURIComponent(signOptOut({userId:item.user_id,email:item.email},secret));
      const email=buildReminderEmail({
        businessName:assessment.businessName,invoice:assessment.invoice,
        recipient:assessment.recipient,unsubscribeUrl:link,template:item.template_json?JSON.parse(item.template_json):null,
      });
      // Re-check immediately before sending, in case a payment or opt-out was recorded
      // while preparing the message. A tiny race with concurrent external actions remains.
      const latest=db.assessReminder(item,Date.now());
      if(!latest.eligible){
        db.completeReminder(item.id,{status:'skipped',now:Date.now(),error:latest.reason});
        result.skipped++;continue;
      }
      await send({...email,replyTo:assessment.senderReplyTo});
      db.completeReminder(item.id,{status:'sent',now:Date.now()});
      result.sent++;
    }catch(err){
      // SMTP failures may occur after acceptance but before receiving ACK.
      // This is intentionally review-only; never auto-retry uncertain delivery.
      db.completeReminder(item.id,{status:'review',now:Date.now(),
        error:'Delivery not confirmed; inspect provider logs before retrying.'});
      result.review++;
      log.error?.('Reminder delivery requires manual review:',item.id,String(err?.message||err));
    }
  }
  return result;
}

export function makeSmtpSender(env=process.env){
  if(env.REMINDER_DELIVERY_MODE!=='live')return null;
  for(const k of ['REMINDER_SMTP_HOST','REMINDER_SMTP_USER','REMINDER_SMTP_PASSWORD','REMINDER_FROM']){
    if(!env[k])throw new Error('Live reminder delivery requires '+k);
  }
  if(env.REMINDER_SMTP_PORT&&env.REMINDER_SMTP_PORT!=='465')
    throw new Error('Oracle SMTP delivery uses encrypted port 465.');
  return email=>sendSmtp({
    host:env.REMINDER_SMTP_HOST,port:465,user:env.REMINDER_SMTP_USER,
    password:env.REMINDER_SMTP_PASSWORD,from:env.REMINDER_FROM,...email,
  });
}
