import {createHash,randomUUID} from 'node:crypto';
import {parseSpreadsheet,normalizeImportDate} from './spreadsheet-import.js';
import {MIGRATION_FIELDS,migrationAliases} from '../public/js/migration-fields.js';
const bad=(message,status=400)=>Object.assign(new Error(message),{status,code:'invalid_migration'});
const tidy=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
const stable=v=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ');
const hash=data=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
export function createMigrationStore(sql){
  sql.exec(`CREATE TABLE IF NOT EXISTS migration_records(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target TEXT NOT NULL,record_id TEXT NOT NULL,fingerprint TEXT NOT NULL,reference TEXT NOT NULL DEFAULT '',custom_json TEXT NOT NULL,
    PRIMARY KEY(user_id,target,fingerprint));
    CREATE TABLE IF NOT EXISTS migration_mappings(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,target TEXT NOT NULL,settings_json TEXT NOT NULL);`);
  const requireTarget=target=>{if(!Object.hasOwn(MIGRATION_FIELDS,target))throw bad('Choose a supported import target.');return MIGRATION_FIELDS[target];};
  const suggest=(target,headers)=>{
    const taken=new Set();return Object.fromEntries(requireTarget(target).fields.map(field=>{
      const aliases=[field,...migrationAliases[field]||[]].map(tidy),index=headers.findIndex((h,i)=>!taken.has(i)&&aliases.includes(tidy(h)));
      if(index>=0)taken.add(index);return [field,index>=0?index:null];
    }));
  };
  const mappingFor=(target,headers,raw)=>{
    const schema=requireTarget(target),mapping=raw||suggest(target,headers),used=new Set();
    if(typeof mapping!=='object'||Array.isArray(mapping))throw bad('Choose valid column mappings.');
    for(const [field,index] of Object.entries(mapping)){
      if(!schema.fields.includes(field))throw bad('Unknown target field: '+field);
      if(index===null)continue;
      if(!Number.isInteger(index)||index<0||index>=headers.length||used.has(index))throw bad('Each source column can be mapped only once.');used.add(index);
    }
    return mapping;
  };
  const fingerprint=(target,data)=>{
    if(target!=='inventory'&&data.reference)return hash(['reference',stable(data.reference)]);
    const fields={leads:['name','email','phone','address'],jobs:['title','customerName','startAt','endAt'],invoices:['customerName','jobTitle','amount','issueDate','dueDate'],expenses:['description','date','amount','currency'],inventory:['sku']}[target];
    return hash(fields.map(k=>stable(data[k])));
  };
  return {
    listMigrationMappings(userId){return sql.prepare('SELECT * FROM migration_mappings WHERE user_id=? ORDER BY name').all(userId).map(r=>({id:r.id,name:r.name,target:r.target,...JSON.parse(r.settings_json)}));},
    saveMigrationMapping(userId,p){
      requireTarget(p?.target);
      if(typeof p.name!=='string'||!p.name.trim()||p.name.length>80||!Array.isArray(p.headers)||p.headers.length>40||p.headers.some(h=>typeof h!=='string'||h.length>200))throw bad('Enter a mapping name and valid headers.');
      const mapping=mappingFor(p.target,p.headers,p.mapping),id=randomUUID();
      sql.prepare('INSERT INTO migration_mappings VALUES(?,?,?,?,?)').run(id,userId,p.name.trim(),p.target,JSON.stringify({headers:p.headers,mapping}));return {id};
    },
    deleteMigrationMapping(userId,id){if(!sql.prepare('DELETE FROM migration_mappings WHERE user_id=? AND id=?').run(userId,id).changes)throw bad('Mapping not found.',404);return {ok:true};},
    migrationMetadata(userId){return sql.prepare('SELECT target,record_id,reference,custom_json FROM migration_records WHERE user_id=?').all(userId).map(r=>({target:r.target,recordId:r.record_id,reference:r.reference,customFields:JSON.parse(r.custom_json)}));},
    clearMigrationData(userId){sql.prepare('DELETE FROM migration_records WHERE user_id=?').run(userId);sql.prepare('DELETE FROM migration_mappings WHERE user_id=?').run(userId);},
    runMigration(api,userId,p,commit=false){
      const schema=requireTarget(p?.target),target=p.target;
      if(commit&&p.approved!==true)throw bad('Review the preview and explicitly approve importing the records.');
      let parsed;
      if(p.headerRow===undefined||p.headerRow==='auto'){
        let score=-1,lastError;
        for(let headerRow=1;headerRow<=10;headerRow++){
          try{const candidate=parseSpreadsheet({...p,headerRow}),mapping=suggest(target,candidate.headers),value=Object.values(mapping).filter(Number.isInteger).length+schema.required.filter(k=>Number.isInteger(mapping[k])).length*3;
            if(value>score){parsed=candidate;score=value;}
          }catch(err){lastError=err;}
        }
        if(!parsed)throw lastError;
      }else parsed=parseSpreadsheet(p);
      let rawMapping=p.mapping;
      if(p.mappingId){
        const saved=sql.prepare('SELECT * FROM migration_mappings WHERE id=? AND user_id=?').get(p.mappingId,userId);
        if(!saved||saved.target!==target)throw bad('Choose a saved mapping for this target.');
        const settings=JSON.parse(saved.settings_json);
        if(JSON.stringify(settings.headers)!==JSON.stringify(parsed.headers))throw bad('The saved mapping headers differ. Review the current columns instead.');rawMapping=settings.mapping;
      }
      const mapping=mappingFor(target,parsed.headers,rawMapping),missing=schema.required.filter(k=>!Number.isInteger(mapping[k]));
      const result={headers:parsed.headers,sheets:parsed.sheets,sheetIndex:parsed.sheetIndex,headerRow:parsed.headerRow,mapping,total:parsed.rows.length,ready:0,duplicates:0,invalid:0,imported:0,rows:[],missing};
      if(missing.length){if(commit)throw bad('Map required columns: '+missing.join(', '));return result;}
      const before=api.getWorkspace(userId),userCurrency=before.account.currency;
      const mapped=new Set(Object.values(mapping).filter(Number.isInteger));
      const dateFields=['date','issueDate','dueDate','paidAt','nextFollowUp'];
      const known=new Set((target==='expenses'||target==='inventory'?before.operations[target]:before[target]||[]).map(r=>fingerprint(target,{...r,amount:r.amount??(target==='invoices'?(r.details?.subtotal??(r.taxable||r.total)):r.total)})));
      const leadContacts=new Set((before.leads||[]).flatMap(r=>[r.email&&'email:'+stable(r.email),r.phone&&'phone:'+r.phone.replace(/\D/g,'')].filter(Boolean)));
      const rollback={preview:true};
      try{sql.transaction(()=>{
        for(let index=0;index<parsed.rows.length;index++){
          const source=parsed.rows[index],data=Object.fromEntries(Object.entries(mapping).filter(([,i])=>Number.isInteger(i)).map(([k,i])=>[k,source[i]]));
          const extras=Object.fromEntries(parsed.headers.map((h,i)=>[i,h]).filter(([i])=>!mapped.has(i)&&source[i]).map(([i,h])=>[(h||'Column')+' ['+(i+1)+']',String(source[i])]));
          let reason='',status='ready';
          try{
            if(Object.values(extras).some(v=>v.length>1000))throw bad('Additional fields must be at most 1,000 characters each.');
            for(const field of dateFields)if(data[field])data[field]=normalizeImportDate(data[field],{date1904:parsed.date1904,dateFormat:p.dateFormat||'ISO'});
            for(const field of ['startAt','endAt'])if(data[field]){
              if(/^\d+(\.\d+)?$/.test(data[field])){
                const n=Number(data[field]),date=normalizeImportDate(String(Math.floor(n)),{date1904:parsed.date1904}),minutes=Math.round((n%1)*1440);
                if(minutes>=1440)throw bad('Check spreadsheet time rounding.');data[field]=date+'T'+String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
              }else data[field]=data[field].replace(' ','T');
            }
            for(const field of ['amount','total','value','quantity','gstRate'])if(data[field]!==undefined&&data[field]!==''){
              if(!/^\d+(?:\.\d{1,3})?$/.test(data[field]))throw bad(field+' must use an unambiguous decimal number without currency symbols.');data[field]=Number(data[field]);
            }
            if(target==='invoices'&&data.currency&&data.currency!==userCurrency)throw bad('Invoice currency must match the workspace. No conversion is performed.');
            if(target==='expenses'&&!data.currency)data.currency=userCurrency;
            const key=fingerprint(target,data),contacts=target==='leads'?[data.email&&'email:'+stable(data.email),data.phone&&'phone:'+data.phone.replace(/\D/g,'')].filter(Boolean):[];
            if(known.has(key)||contacts.some(k=>leadContacts.has(k))||sql.prepare('SELECT 1 FROM migration_records WHERE user_id=? AND target=? AND (fingerprint=? OR (?!=\'\' AND reference=?))').get(userId,target,key,data.reference||'',data.reference||'')){
              status='duplicate';result.duplicates++;
            }else{
              // Use the same validators as manual entry. Each invalid row rolls
              // back independently; a commit with any invalid row rolls back all.
              sql.transaction(()=>{
                const record=target==='leads'?api.createLead(userId,{...data,createReminder:false},{historical:true}):target==='jobs'?api.createJob(userId,data,{historical:true}):target==='invoices'?api.createInvoice(userId,data):api.saveOperationRecord(userId,target,null,{...data,customFields:extras});
                if(target==='invoices'){
                  if(data.total!==undefined&&Math.abs(record.total-data.total)>0.00001)throw bad('Imported total does not match validated line amount and taxes.');
                  if(data.paidAt&&data.status==='Paid')sql.prepare('UPDATE invoices SET paid_at=? WHERE id=? AND user_id=?').run(data.paidAt,record.id,userId);
                }
                sql.prepare('INSERT INTO migration_records VALUES(?,?,?,?,?,?)').run(userId,target,String(record.id),key,data.reference||'',JSON.stringify(extras));
              })();
              known.add(key);contacts.forEach(k=>leadContacts.add(k));result.ready++;
            }
          }catch(err){if(!err.status)throw err;reason=err.message;status='invalid';result.invalid++;}
          if(result.rows.length<100)result.rows.push({row:parsed.headerRow+index+1,status,reason,data,customFields:extras});
        }
        if(!commit||result.invalid)throw rollback;
        result.imported=result.ready;
      })();}catch(err){if(err!==rollback)throw err;}
      if(commit&&result.invalid)throw bad('Import cancelled: '+result.invalid+' invalid rows. Correct them and preview again.');
      return result;
    },
  };
}
