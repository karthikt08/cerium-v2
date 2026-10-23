import {randomUUID} from 'node:crypto';

// Job times are local business wall-clock values: YYYY-MM-DDTHH:mm.
// This module has no external scheduler, notifications or paid dependencies.
export class JobsError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const ACTIVE = ['Scheduled', 'Confirmed', 'In progress'];
const STATUSES = [...ACTIVE, 'Completed', 'Cancelled'];
const text = (v, label, max, required = false) => {
  if (typeof v !== 'string' || v.trim().length > max || (required && !v.trim()))
    throw new JobsError('invalid_field', label + ' must contain ' + (required ? '1–' : '0–') + max + ' characters.');
  return v.trim();
};
const opt = (v,label,max) => text(v ?? '',label,max);
const validDateTime = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return false;
  const date = new Date(v + ':00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,16) === v;
};
const jobOut = r => ({id:r.id,leadId:r.lead_id || null,workerId:r.worker_id || null,title:r.title,
  billableItems: JSON.parse(r.billable_items_json || '[]'), invoiceGenerated: Boolean(r.invoice_generated),
  customerName:r.customer_name,customerPhone:r.customer_phone,address:r.address,notes:r.notes,
  startAt:r.starts_at,endAt:r.ends_at,status:r.status,createdAt:r.created_at,updatedAt:r.updated_at});
const crewOut = r => ({id:r.id,name:r.name,role:r.role,phone:r.phone,active:Boolean(r.active)});

export function createJobsStore(db, { onCompleted = () => {} } = {}) {
  // Additive migration works on existing user SQLite databases.
  db.exec("CREATE TABLE IF NOT EXISTS crew_members (" +
    "id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE," +
    "name TEXT NOT NULL, role TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT ''," +
    "active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_at TEXT NOT NULL);" +
    "CREATE INDEX IF NOT EXISTS crew_owner ON crew_members(user_id, active);" +
    "CREATE TABLE IF NOT EXISTS jobs (" +
    "id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE," +
    "lead_id TEXT, worker_id TEXT REFERENCES crew_members(id) ON DELETE RESTRICT," +
    "title TEXT NOT NULL, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL DEFAULT ''," +
    "address TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT ''," +
    "starts_at TEXT NOT NULL, ends_at TEXT NOT NULL," +
    "status TEXT NOT NULL DEFAULT 'Scheduled' CHECK(status IN ('Scheduled','Confirmed','In progress','Completed','Cancelled'))," +
    "created_at TEXT NOT NULL, updated_at TEXT NOT NULL, CHECK(ends_at > starts_at));" +
    "CREATE INDEX IF NOT EXISTS jobs_owner_start ON jobs(user_id,starts_at);" +
    "CREATE INDEX IF NOT EXISTS jobs_owner_worker ON jobs(user_id,worker_id,starts_at,ends_at);");
  // Additive migrations preserve existing Jobs created before billing was introduced.
  const columns = new Set(db.prepare('PRAGMA table_info(jobs)').all().map(c => c.name));
  if (!columns.has('billable_items_json')) db.exec("ALTER TABLE jobs ADD COLUMN billable_items_json TEXT NOT NULL DEFAULT '[]'");
  if (!columns.has('invoice_generated')) db.exec('ALTER TABLE jobs ADD COLUMN invoice_generated INTEGER NOT NULL DEFAULT 0');
  const q = {
    jobs:db.prepare('SELECT * FROM jobs WHERE user_id=? ORDER BY starts_at ASC,id ASC'),
    job:db.prepare('SELECT * FROM jobs WHERE id=? AND user_id=?'),
    crew:db.prepare('SELECT * FROM crew_members WHERE user_id=? ORDER BY active DESC,name COLLATE NOCASE'),
    worker:db.prepare('SELECT * FROM crew_members WHERE id=? AND user_id=?'),
    lead:db.prepare('SELECT id FROM leads WHERE id=? AND user_id=?'),
    overlap:db.prepare("SELECT id FROM jobs WHERE user_id=? AND worker_id=? AND id!=? AND status IN ('Scheduled','Confirmed','In progress') AND starts_at<? AND ends_at>? LIMIT 1"),
    assigned:db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE user_id=? AND worker_id=? AND status IN ('Scheduled','Confirmed','In progress')"),
    newCrew:db.prepare('INSERT INTO crew_members(id,user_id,name,role,phone,created_at) VALUES(?,?,?,?,?,?)'),
    archive:db.prepare('UPDATE crew_members SET active=0 WHERE id=? AND user_id=?'),
    newJob:db.prepare('INSERT INTO jobs(id,user_id,lead_id,worker_id,title,customer_name,customer_phone,address,notes,starts_at,ends_at,status,created_at,updated_at,billable_items_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'),
    editJob:db.prepare('UPDATE jobs SET lead_id=?,worker_id=?,title=?,customer_name=?,customer_phone=?,address=?,notes=?,starts_at=?,ends_at=?,status=?,billable_items_json=?,updated_at=? WHERE id=? AND user_id=?'),
    generated:db.prepare('UPDATE jobs SET invoice_generated=1 WHERE id=? AND user_id=?'),
    deleteJob:db.prepare('DELETE FROM jobs WHERE id=? AND user_id=?'),
    clearJobs:db.prepare('DELETE FROM jobs WHERE user_id=?'),
    clearCrew:db.prepare('DELETE FROM crew_members WHERE user_id=?'),
  };
  function normalize(p,userId,id='') {
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new JobsError('invalid_job','Enter job details.');
    const j = {title:text(p.title,'Job title',120,true),customerName:text(p.customerName,'Customer name',120,true),
      customerPhone:opt(p.customerPhone,'Phone',40),address:opt(p.address,'Service address',240),
      notes:opt(p.notes,'Notes',1500),startAt:p.startAt,endAt:p.endAt,
      status:p.status === undefined ? 'Scheduled' : p.status,workerId:p.workerId || null,leadId:p.leadId || null,
      billableItems: p.billableItems === undefined ? [] : p.billableItems};
    if (!Array.isArray(j.billableItems) || j.billableItems.length > 20)
      throw new JobsError('invalid_items','Add no more than 20 billing line items.');
    j.billableItems = j.billableItems.map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new JobsError('invalid_items','Invalid billing line item.');
      const description = text(item.description, 'Line item description', 180, true);
      const qty = Number(item.qty), rate = Number(item.rate);
      if (!Number.isFinite(qty) || !Number.isFinite(rate) || qty <= 0 || qty > 10000 || rate < 0 || rate > 1000000 ||
          !Number.isInteger(qty*100) || !Number.isInteger(rate*100))
        throw new JobsError('invalid_items','Line item quantity and rate must be valid numbers with at most 2 decimals.');
      return {description,qty,rate};
    });
    if (!validDateTime(j.startAt) || !validDateTime(j.endAt) || j.startAt>=j.endAt)
      throw new JobsError('invalid_schedule','Choose valid start/end times with the end after the start.');
    if ((new Date(j.endAt+':00Z')-new Date(j.startAt+':00Z'))>72*3600000)
      throw new JobsError('invalid_schedule','Jobs cannot exceed 72 hours.');
    if (!STATUSES.includes(j.status)) throw new JobsError('invalid_status','Invalid job status.');
    if (j.leadId && (typeof j.leadId!=='string' || !q.lead.get(j.leadId,userId)))
      throw new JobsError('invalid_lead','The lead is not in your workspace.');
    if (j.workerId) {
      if (typeof j.workerId!=='string') throw new JobsError('invalid_worker','Invalid crew member.');
      const worker=q.worker.get(j.workerId,userId);
      if (!worker || !worker.active) {
        // Archived crew can stay assigned to old jobs, but cannot receive new active jobs.
        if (!(id && worker && !worker.active && q.job.get(id,userId)?.worker_id===worker.id && !ACTIVE.includes(j.status)))
          throw new JobsError('invalid_worker','Choose an active crew member from your workspace.');
      }
      if (ACTIVE.includes(j.status) && q.overlap.get(userId,j.workerId,id,j.endAt,j.startAt))
        throw new JobsError('schedule_conflict','Crew member is already booked at that time. Change the time or assignment.',409);
    }
    return j;
  }
  return {
    listJobs(userId){return q.jobs.all(userId).map(jobOut);},
    listCrew(userId){return q.crew.all(userId).map(crewOut);},
    addCrew(userId,p){
      const name=text(p?.name,'Crew name',100,true),role=opt(p?.role,'Role',80),phone=opt(p?.phone,'Phone',40);
      const id=randomUUID();q.newCrew.run(id,userId,name,role,phone,new Date().toISOString());return crewOut(q.worker.get(id,userId));
    },
    archiveCrew(userId,id){
      if (!q.worker.get(id,userId))throw new JobsError('not_found','Crew member not found.',404);
      if (q.assigned.get(userId,id).n)throw new JobsError('worker_assigned','Reassign or finish active jobs before archiving this worker.',409);
      q.archive.run(id,userId);return {ok:true};
    },
    createJob(userId,p){return db.transaction(()=>{
      const j=normalize(p,userId),id=randomUUID(),now=new Date().toISOString();
      q.newJob.run(id,userId,j.leadId,j.workerId,j.title,j.customerName,j.customerPhone,j.address,j.notes,j.startAt,j.endAt,j.status,now,now,JSON.stringify(j.billableItems));
      if (j.status==='Completed') { onCompleted(userId,jobOut(q.job.get(id,userId)));q.generated.run(id,userId); }
      return jobOut(q.job.get(id,userId));
    })();},
    updateJob(userId,id,p){return db.transaction(()=>{
      const previous=q.job.get(id,userId);
      if(!previous)throw new JobsError('not_found','Job not found.',404);
      if (!p || typeof p!=='object' || Array.isArray(p))throw new JobsError('invalid_job','Enter valid job changes.');
      const j=normalize({...jobOut(previous),...p},userId,id);
      q.editJob.run(j.leadId,j.workerId,j.title,j.customerName,j.customerPhone,j.address,j.notes,j.startAt,j.endAt,j.status,JSON.stringify(j.billableItems),new Date().toISOString(),id,userId);
      if (j.status==='Completed' && !previous.invoice_generated) { onCompleted(userId,jobOut(q.job.get(id,userId)));q.generated.run(id,userId); }
      return jobOut(q.job.get(id,userId));
    })();},
    deleteJob(userId,id){
      if(!q.deleteJob.run(id,userId).changes)throw new JobsError('not_found','Job not found.',404);
      return {ok:true};
    },
    clear(userId){q.clearJobs.run(userId);q.clearCrew.run(userId);}
  };
}
