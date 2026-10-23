// Dedicated, low-resource worker for an Oracle VM (or local testing).
// Run: npm run reminders:worker
// One worker per database, supervised by systemd. No outgoing email without
// REMINDER_DELIVERY_MODE=live and complete SMTP credentials.
import path from 'node:path';
import dotenv from 'dotenv';
import {fileURLToPath} from 'node:url';
import {openDb} from '../server/db.js';
import {processDueReminders,makeSmtpSender} from '../server/reminder-worker.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.env.NODE_ENV!=='production')dotenv.config({path:path.join(root,'.env'),quiet:true});
const send=makeSmtpSender(process.env);
if(!send) {
  console.log('CERIUM reminder delivery disabled. No email will be sent.');
  process.exit(0);
}
const dbPath=process.env.DATABASE_PATH;
const baseUrl=process.env.BASE_URL;
const secret=process.env.SESSION_SECRET;
if(!dbPath||!path.isAbsolute(dbPath)||dbPath===':memory:')
  throw new Error('Worker requires an absolute persistent DATABASE_PATH.');
if(!baseUrl||!baseUrl.startsWith('https://'))
  throw new Error('Worker requires an HTTPS BASE_URL.');
if(!secret||secret.length<32)
  throw new Error('Worker requires the persistent SESSION_SECRET shared with the web app.');
const db=openDb(dbPath);
let running=false,stopping=false;
async function tick(){
  if(running||stopping)return;
  running=true;
  try {
    const summary=await processDueReminders({db,send,secret,baseUrl,limit:3});
    if(summary.claimed)console.log('Reminder tick:',JSON.stringify(summary));
  }catch(err){console.error('Reminder worker error:',err.message);}
  finally{running=false;}
}
await tick();
const poll=setInterval(()=>{void tick();},60_000);
async function stop(){
  stopping=true;clearInterval(poll);
  while(running)await new Promise(resolve=>setTimeout(resolve,100));
  db.close();
  process.exit(0);
}
process.on('SIGTERM',()=>{void stop();});
process.on('SIGINT',()=>{void stop();});
console.log('CERIUM reminder worker started (60s polling, batch 3, one-at-a-time).');
