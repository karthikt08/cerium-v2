import {randomUUID} from 'node:crypto';
import {OPERATION_FIELDS} from '../public/js/operation-fields.js';
export const operationError=(message,status=400)=>Object.assign(new Error(message),{status,code:'invalid_operation'});
const fail=(message,status)=>{throw operationError(message,status);};
export function localMinute(value){
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value))return false;
  const d=new Date(value+':00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,16)===value;
}
const overlap=(a,b)=>a.startAt<(b.endAt||'9999')&&(a.endAt||'9999')>b.startAt;
export function workerAvailability(db,userId,workerId,startAt,endAt,jobId=''){
  const crew=db.prepare('SELECT * FROM crew_members WHERE id=? AND user_id=?').get(workerId,userId);
  if(!crew?.active)return {available:false,reason:'Inactive or missing crew member'};
  const rows=db.prepare("SELECT data_json FROM operation_records WHERE user_id=? AND kind='availability'").all(userId).map(r=>JSON.parse(r.data_json)).filter(r=>r.workerId===workerId);
  const interval={startAt,endAt};
  if(rows.some(r=>r.type==='Unavailable'&&overlap(r,interval)))return {available:false,reason:'Recorded as unavailable'};
  const windows=rows.filter(r=>r.type==='Available');
  const covered=windows.some(r=>r.startAt<=startAt&&r.endAt>=endAt);
  if(windows.length&&!covered)return {available:false,reason:'Outside recorded availability'};
  const conflict=db.prepare("SELECT id FROM jobs WHERE user_id=? AND worker_id=? AND id!=? AND status IN ('Scheduled','Confirmed','In progress') AND starts_at<? AND ends_at>? LIMIT 1").get(userId,workerId,jobId,endAt,startAt);
  if(conflict)return {available:false,reason:'Overlaps an assigned job'};
  return {available:covered,unconfigured:!windows.length,reason:covered?'Available for this appointment':'Availability not recorded'};
}
export function createOperationStore(db){
  db.exec(`CREATE TABLE IF NOT EXISTS operation_records(
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS operation_owner_kind ON operation_records(user_id,kind);`);
  const out=r=>({...JSON.parse(r.data_json),id:r.id,createdAt:r.created_at,updatedAt:r.updated_at});
  const validKind=kind=>{if(!Object.hasOwn(OPERATION_FIELDS,kind))fail('Unknown record type.',404);};
  const store={
    listOperationRecords(userId,kind){validKind(kind);return db.prepare('SELECT * FROM operation_records WHERE user_id=? AND kind=? ORDER BY created_at,id').all(userId,kind).map(out);},
    allOperationRecords(userId){return Object.fromEntries(Object.keys(OPERATION_FIELDS).map(kind=>[kind,store.listOperationRecords(userId,kind)]));},
    saveOperationRecord(userId,kind,id,p){return db.transaction(()=>{
      validKind(kind);if(!p||typeof p!=='object'||Array.isArray(p))fail('Enter record details.');
      const previous=id?db.prepare('SELECT * FROM operation_records WHERE id=? AND user_id=? AND kind=?').get(id,userId,kind):null;
      if(id&&!previous)fail('Record not found.',404);
      const data=previous?JSON.parse(previous.data_json):{};
      for(const [key,label,type,required] of OPERATION_FIELDS[kind].fields){
        const value=p[key]??data[key]??'';
        if(typeof value!=='string'&&typeof value!=='number')fail(label+' must be text or a number.');
        data[key]=String(value).trim();
        if(required&&!data[key])fail(label+' is required.');
        if(data[key].length>(type==='textarea'?3000:200))fail(label+' is too long.');
      }
      if(p.customFields!==undefined){
        if(!p.customFields||typeof p.customFields!=='object'||Array.isArray(p.customFields)||Object.keys(p.customFields).length>40)fail('Invalid custom fields.');
        data.customFields=Object.fromEntries(Object.entries(p.customFields).map(([k,v])=>{if(k.length>100||typeof v!=='string'||v.length>1000)fail('Invalid custom field.');return [k,v];}));
      }
      if(kind==='availability'||kind==='timesheets'){
        const worker=db.prepare('SELECT * FROM crew_members WHERE id=? AND user_id=?').get(data.workerId,userId);
        if(!worker)fail('Choose a crew member from your workspace.');
        if(!localMinute(data.startAt)||data.endAt&&!localMinute(data.endAt)||data.endAt&&data.endAt<=data.startAt)fail('Choose valid start and end times.');
        if(kind==='availability'){
          if(!['Available','Unavailable'].includes(data.type))fail('Choose Available or Unavailable.');
          if(data.type==='Unavailable'&&db.prepare("SELECT 1 FROM jobs WHERE user_id=? AND worker_id=? AND status IN ('Scheduled','Confirmed','In progress') AND starts_at<? AND ends_at>? LIMIT 1").get(userId,data.workerId,data.endAt,data.startAt))fail('Reassign or reschedule conflicting active jobs before recording this absence.',409);
        }else{
          if(data.jobId){const job=db.prepare('SELECT worker_id FROM jobs WHERE id=? AND user_id=?').get(data.jobId,userId);if(!job||job.worker_id&&job.worker_id!==data.workerId)fail('Choose a job assigned to this crew member.');}
          if(!worker.active&&!data.endAt)fail('Archived crew cannot clock in.');
          const minutes=data.endAt?(Date.parse(data.endAt+'Z')-Date.parse(data.startAt+'Z'))/60000:null;
          data.breakMinutes=Number(data.breakMinutes||0);
          if(!Number.isInteger(data.breakMinutes)||data.breakMinutes<0||data.breakMinutes>1440||minutes!==null&&(minutes>72*60||data.breakMinutes>=minutes))fail('Check shift duration and break minutes (maximum shift: 72 hours).');
          if(store.listOperationRecords(userId,kind).some(r=>r.id!==id&&r.workerId===data.workerId&&overlap(r,data)))fail('This shift overlaps another recorded shift.',409);
        }
      }
      if(kind==='templates'&&(data.subject.length>160||/[\r\n]/.test(data.subject)))fail('Use a one-line subject of at most 160 characters.');
      if(kind==='expenses'){
        if(!/^\d{4}-\d\d-\d\d$/.test(data.date)||!localMinute(data.date+'T00:00'))fail('Use a valid expense date.');
        if(!Intl.supportedValuesOf('currency').includes(data.currency))fail('Choose a valid currency code.');
        data.amount=Number(data.amount);if(!Number.isFinite(data.amount)||data.amount<=0||data.amount>1e9||Math.abs(data.amount*100-Math.round(data.amount*100))>1e-6)fail('Enter a positive expense amount with at most two decimals.');
      }
      if(kind==='inventory'){
        data.quantity=Number(data.quantity);if(!Number.isFinite(data.quantity)||data.quantity<0||data.quantity>1e9||Math.abs(data.quantity*100-Math.round(data.quantity*100))>1e-6)fail('Enter a non-negative quantity with at most two decimals.');
        if(store.listOperationRecords(userId,kind).some(r=>r.id!==id&&r.sku.toLowerCase()===data.sku.toLowerCase()))fail('An inventory item with this SKU already exists.',409);
      }
      const key=id||randomUUID(),now=new Date().toISOString();
      db.prepare('INSERT INTO operation_records(id,user_id,kind,data_json,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at').run(key,userId,kind,JSON.stringify(data),previous?.created_at||now,now);
      return out(db.prepare('SELECT * FROM operation_records WHERE id=? AND user_id=?').get(key,userId));
    })();},
    deleteOperationRecord(userId,kind,id){validKind(kind);if(!db.prepare('DELETE FROM operation_records WHERE id=? AND user_id=? AND kind=?').run(id,userId,kind).changes)fail('Record not found.',404);return {ok:true};},
    clearOperationRecords(userId){db.prepare('DELETE FROM operation_records WHERE user_id=?').run(userId);},
    dispatchCandidates(userId,jobId){
      const job=db.prepare('SELECT * FROM jobs WHERE id=? AND user_id=?').get(jobId,userId);if(!job)fail('Job not found.',404);
      return db.prepare('SELECT id,name FROM crew_members WHERE user_id=? AND active=1 ORDER BY name').all(userId).map(c=>({...c,...workerAvailability(db,userId,c.id,job.starts_at,job.ends_at,jobId)}));
    },
  };
  return store;
}
