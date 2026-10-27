// Customer/lead spreadsheet migration UI. Only explicit confirmation writes records.
import {escapeHTML as esc} from './workspace-model.js';

const FIELDS=[
  ['name','Customer / lead name (required)'],
  ['phone','Phone number'],
  ['email','Email address'],
  ['address','Address'],
  ['source','Lead source'],
  ['stage','Pipeline stage'],
  ['value','Estimated value'],
  ['nextFollowUp','Follow-up date'],
  ['notes','Notes']
];

export function openLeadImport({api,onComplete,readOnly=false,offline=false}){
  if(readOnly)throw new Error('Imports are unavailable while your workspace is read-only.');
  if(offline)throw new Error('Spreadsheet imports require the connected Cerium workspace.');
  let dialog=document.getElementById('lead-import-dialog');
  if(dialog)dialog.remove();
  {
    dialog=document.createElement('dialog');
    dialog.id='lead-import-dialog';
    dialog.className='dialog lead-import-dialog';
    dialog.setAttribute('aria-labelledby','lead-import-heading');
    document.body.append(dialog);
  }
  let current=null,mapping=null,latest=null,requestNumber=0,busy=false;
  dialog.innerHTML='<div class="dialog-header"><div><p class="eyebrow">DATA MIGRATION</p><h2 id="lead-import-heading">Import customers &amp; <span class="ac">leads<svg class="ul" viewBox="0 0 300 14" aria-hidden="true"><path pathLength="1" d="M3 9C60 3 120 12 180 6s90 3 117 0"/></svg></span></h2></div><button type="button" class="icon-button" id="lead-import-close" aria-label="Close import">×</button></div>'+
    '<p class="dialog-description">Bring existing contacts and leads into your pipeline. Choose a CSV or Excel (.xlsx) file, check the column mapping, then review what Cerium will add. Existing records are never replaced.</p>'+
    '<div class="import-content"><label class="field">Choose a spreadsheet<input id="lead-import-file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>'+
    '<p class="muted">2 MB · 2,000 rows · select any worksheet and a header row from 1 to 10</p>'+
    '<div class="import-mapping-grid" id="lead-import-layout" hidden>'+
    '<label class="field">Worksheet<select id="lead-import-sheet"></select></label>'+
    '<label class="field">Header row<input id="lead-import-header-row" type="number" min="1" max="10" value="1"></label>'+
    '<label class="field">Date format<select id="lead-import-date-format"><option value="ISO">YYYY-MM-DD / Excel date</option><option value="DMY">DD/MM/YYYY</option><option value="MDY">MM/DD/YYYY</option></select></label>'+
    '<label class="field">Unmatched fields<select id="lead-import-extra-action"><option value="review">Review before importing</option><option value="notes">Keep values in Notes</option><option value="skip">Explicitly skip columns</option></select></label>'+
    '</div><div id="lead-import-extra-warning" hidden></div>'+
    '<p id="lead-import-status" class="muted" role="status" aria-live="polite">Nothing is imported until you confirm.</p>'+
    '<div id="lead-import-mapping" hidden></div><div id="lead-import-results" hidden></div>'+
    '<p id="lead-import-error" class="form-error" role="alert" hidden></p></div>'+
    '<div class="dialog-footer"><button id="lead-import-cancel" type="button" class="button secondary">Cancel</button><button id="lead-import-submit" type="button" class="button primary" disabled>Import valid rows</button></div>';
  const $=id=>dialog.querySelector('#'+id);
  const err=message=>{$('lead-import-error').textContent=message;$('lead-import-error').hidden=!message;};
  const info=message=>{$('lead-import-status').textContent=message;};
  const submit=$('lead-import-submit');
  const request=()=>({...current,headerRow:Number($('lead-import-header-row').value||1),
    sheetIndex:Number($('lead-import-sheet').value||0),
    dateFormat:$('lead-import-date-format').value,extraAction:$('lead-import-extra-action').value,
    ...(mapping?{mapping}:{})});
  const lock=value=>{
    busy=value;
    submit.disabled=value||!latest||latest.ready===0||Boolean(latest?.extraColumns?.length&&$('lead-import-extra-action').value==='review');
    $('lead-import-file').disabled=value;
    dialog.querySelectorAll('select,input[type="number"]').forEach(el=>el.disabled=value);
    $('lead-import-cancel').disabled=value;
    $('lead-import-close').disabled=value;
    dialog.toggleAttribute('aria-busy',value);
  };
  function renderMapping(){
    const headers=latest.headers;
    $('lead-import-mapping').hidden=false;
    $('lead-import-mapping').innerHTML='<h3 class="import-subheading">Match your columns</h3><p class="muted">We guessed the headers. Adjust any field before importing. Leave unused fields unmapped.</p>'+
      '<div class="import-mapping-grid">'+FIELDS.map(([key,label])=>{
        const selected=mapping[key];
        return '<label class="field"><span>'+esc(label)+'</span><select data-import-field="'+key+'" aria-label="'+esc(label)+'">'+
          '<option value="">Do not import</option>'+
          headers.map((h,i)=>'<option value="'+i+'" '+(selected===i?'selected':'')+'>'+esc(h||'Column '+(i+1))+'</option>').join('')+
          '</select></label>';
      }).join('')+'</div>';
  }
  function renderResults(){
    const s=latest;
    $('lead-import-layout').hidden=false;
    $('lead-import-sheet').innerHTML=s.sheets.map((name,i)=>'<option value="'+i+'"'+(i===s.sheetIndex?' selected':'')+'>'+esc(name)+'</option>').join('');
    const warning=$('lead-import-extra-warning');
    warning.hidden=!s.extraColumns?.length;
    warning.innerHTML=s.extraColumns?.length?
      '<p class="due-import-extra"><strong>Additional columns:</strong> '+s.extraColumns.map(esc).join(', ')+'. Cerium does not create custom searchable fields yet. Preserve their values in Notes or explicitly choose to skip them.</p>':'';
    $('lead-import-results').hidden=false;
    $('lead-import-results').innerHTML='<h3 class="import-subheading">Review import</h3>'+
      '<div class="import-stats"><span><strong>'+s.ready+'</strong> ready to add</span><span><strong>'+s.duplicates+'</strong> duplicates skipped</span><span><strong>'+s.invalid+'</strong> invalid rows skipped</span></div>'+
      '<p class="muted">Preview of the first '+s.samples.length+' rows. Reimporting the same file will skip matching email addresses, phone numbers, or name/address records. Imported leads will not automatically send messages, create reminders, or trigger reviews.</p>'+
      '<div class="table-scroll" tabindex="0"><table class="data-table"><thead><tr><th scope="col">Row</th><th scope="col">Name</th><th scope="col">Contact</th><th scope="col">Stage</th><th scope="col">Value</th><th scope="col">Result</th></tr></thead><tbody>'+
      s.samples.map(item=>'<tr><td>'+item.row+'</td><td>'+esc(item.name||'—')+'</td><td>'+esc(item.contact||'—')+'</td><td>'+esc(item.stage||'—')+'</td><td>'+esc(item.value||'0')+'</td><td>'+esc(item.reason||({ready:'Ready',duplicate:'Already exists',invalid:'Needs correction'}[item.status]||item.status))+'</td></tr>').join('')+
      '</tbody></table></div>'+
      (s.errors.length?'<details class="import-errors"><summary>Show row errors ('+s.invalid+')</summary><ul>'+s.errors.map(item=>'<li>Row '+item.row+': '+esc(item.reason)+'</li>').join('')+'</ul></details>':'');
    submit.textContent='Import '+s.ready+' '+(s.ready===1?'lead':'leads');
    lock(false);
  }
  async function preview({resetMapping=false}={}){
    if(!current)return;
    if(resetMapping)mapping=null;
    const seq=++requestNumber;
    err('');latest=null;lock(true);info('Checking the spreadsheet. Nothing has been saved.');
    try{
      const response=await api.previewLeadImport(request());
      if(seq!==requestNumber)return;
      latest=response;
      mapping={...response.mapping};
      renderMapping();
      renderResults();
      info('Preview complete: '+response.total+' rows checked.');
    }catch(e){
      if(seq!==requestNumber)return;
      $('lead-import-results').hidden=true;
      if(!mapping)$('lead-import-mapping').hidden=true;
      err(e.message||'Could not read the spreadsheet.');
      info('No records have been imported.');
    }finally{if(seq===requestNumber)lock(false);}
  }
  $('lead-import-close').addEventListener('click',()=>{if(!busy)dialog.close();});
  $('lead-import-cancel').addEventListener('click',()=>{if(!busy)dialog.close();});
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  dialog.addEventListener('close',()=>{current=null;mapping=null;latest=null;requestNumber++;},{once:true});
  $('lead-import-file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];
    current=null;mapping=null;latest=null;
    $('lead-import-mapping').hidden=true;$('lead-import-results').hidden=true;$('lead-import-layout').hidden=true;$('lead-import-extra-warning').hidden=true;err('');
    if(!file)return;
    if(!/\.(csv|xlsx)$/i.test(file.name)){err('Use a .csv or .xlsx file. Save older .xls files as .xlsx first.');return;}
    if(file.size>2*1024*1024||file.size===0){err('Choose a nonempty file smaller than 2 MB.');return;}
    lock(true);info('Reading file locally…');
    try{
      const data=await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onerror=()=>reject(new Error('The selected file could not be read.'));
        reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');
        reader.readAsDataURL(file);
      });
      current={filename:file.name,content:data};await preview();
    }catch(e){err(e.message||'File reading failed.');info('No records have been imported.');}
    finally{lock(false);}
  });
  dialog.addEventListener('change',e=>{
    if(!current)return;
    const select=e.target.closest('select[data-import-field]');
    if(select){
      mapping[select.dataset.importField]=select.value===''?null:Number(select.value);
      latest=null;submit.disabled=true;preview();return;
    }
    if(e.target.matches('#lead-import-sheet,#lead-import-header-row')){preview({resetMapping:true});return;}
    if(e.target.matches('#lead-import-date-format,#lead-import-extra-action')){preview();}
  });
  submit.addEventListener('click',async()=>{
    if(!current||!latest||busy||latest.ready<1)return;
    const count=latest.ready;lock(true);err('');info('Importing '+count+' checked records…');
    try{
      const result=await api.commitLeadImport(request());
      info(result.imported+' leads imported. '+result.duplicates+' duplicates and '+result.invalid+' invalid rows skipped.');
      if(result.imported){await onComplete(result);dialog.close();}
      else{latest=result;renderResults();}
    }catch(e){err(e.message||'Import failed. No changes were saved.');}
    finally{lock(false);}
  });
  dialog.showModal();
  $('lead-import-file').focus();
}
