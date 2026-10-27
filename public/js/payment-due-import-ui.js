// Explicitly reviewed, manual CSV/.xlsx custom dues import.
import {escapeHTML as esc} from './workspace-model.js';
const DUE_FIELDS=[
  ['customerName','Customer / party (required)'],
  ['description','Description / installment'],
  ['amount','Amount (required)'],
  ['dueDate','Due date (required)'],
  ['reference','External invoice / order reference'],
  ['notes','Notes / remarks']
];
export function openPaymentDueImport({api,onComplete,readOnly=false}){
  if(readOnly)throw new Error('Imports are unavailable while your workspace is read-only.');
  document.getElementById('due-import-dialog')?.remove();
  const dialog=document.createElement('dialog');
  dialog.id='due-import-dialog';
  dialog.className='dialog lead-import-dialog due-import-dialog';
  dialog.setAttribute('aria-labelledby','due-import-heading');
  document.body.append(dialog);
  dialog.innerHTML='<div class="dialog-header"><div><p class="eyebrow">SMART IMPORT</p><h2 id="due-import-heading">Import custom dues</h2></div><button type="button" class="icon-button" data-close aria-label="Close import">×</button></div>'+
    '<p class="dialog-description">Bring due balances and installment schedules from CSV or Excel. Match columns, review every exception and confirm the currency before importing. Existing records are never overwritten.</p>'+
    '<div class="import-content">'+
    '<label class="field">Spreadsheet <input type="file" data-file accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>'+
    '<p class="muted">Up to 2 MB, 2,000 rows, 40 columns. No formulas or macros are executed.</p>'+
    '<div class="import-mapping-grid" data-layout hidden>'+
      '<label class="field">Worksheet <select data-sheet></select></label>'+
      '<label class="field">Header row (1–10) <input data-header-row type="number" min="1" max="10" step="1" value="1"></label>'+
      '<label class="field">Date format <select data-date-format><option value="ISO">YYYY-MM-DD / Excel date</option><option value="DMY">DD/MM/YYYY</option><option value="MDY">MM/DD/YYYY</option></select></label>'+
      '<label class="field">Unmatched columns <select data-extra><option value="review">Choose how to handle</option><option value="notes">Preserve values in Notes</option><option value="skip">Explicitly skip these columns</option></select></label>'+
    '</div><div data-mapping hidden></div><div data-extra-warning hidden></div><div data-results hidden></div>'+
    '<label class="due-import-currency"><input data-currency-confirm type="checkbox"> I confirm that amounts in this file use my Cerium business currency <strong data-currency></strong>. This importer does not convert currencies or record payments.</label>'+
    '<p data-status class="muted" role="status" aria-live="polite">Nothing will be saved until you review the preview and confirm.</p>'+
    '<p data-error class="form-error" role="alert" hidden></p></div>'+
    '<div class="dialog-footer"><button type="button" class="button secondary" data-close>Cancel</button><button type="button" class="button primary" data-import disabled>Import reviewed dues</button></div>';
  let current=null,mapping=null,latest=null,busy=false,sequence=0;
  const $=sel=>dialog.querySelector('[data-'+sel+']');
  const setError=message=>{const el=$('error');el.textContent=message||'';el.hidden=!message;};
  const setStatus=message=>{$('status').textContent=message;};
  const submit=$('import');
  const request=()=>({
    ...current,
    sheetIndex:Number($('sheet').value||0),
    headerRow:Number($('header-row').value||1),
    dateFormat:$('date-format').value,
    extraAction:$('extra').value,
    ...(mapping?{mapping}:{}),
  });
  const lock=val=>{
    busy=val;
    dialog.toggleAttribute('aria-busy',val);
    for(const el of dialog.querySelectorAll('select,input,button:not([data-import])'))el.disabled=val;
    submit.disabled=val||!latest||!latest.ready||!$('currency-confirm').checked||
      (latest.extraColumns?.length&&$('extra').value==='review');
  };
  function renderMapping(){
    const headers=latest.headers;
    const slot=$('mapping');slot.hidden=false;
    slot.innerHTML='<h3 class="import-subheading">Match spreadsheet columns</h3>'+
      '<p class="muted">Cerium suggested these mappings. Correct them before proceeding; no customer name, amount or due date is invented.</p>'+
      '<div class="import-mapping-grid">'+DUE_FIELDS.map(([key,label])=>
        '<label class="field"><span>'+esc(label)+'</span><select data-map="'+key+'"><option value="">Not mapped</option>'+
        headers.map((h,i)=>'<option value="'+i+'" '+(mapping[key]===i?'selected':'')+'>'+esc(h||'Column '+(i+1))+'</option>').join('')+
        '</select></label>'
      ).join('')+'</div>';
  }
  function renderResults(){
    const r=latest;
    $('layout').hidden=false;
    const sheet=$('sheet'),selected=String(r.sheetIndex);
    const options=r.sheets.map((name,i)=>'<option value="'+i+'"'+(String(i)===selected?' selected':'')+'>'+esc(name)+'</option>').join('');
    sheet.innerHTML=options;
    const extras=$('extra-warning');
    extras.hidden=!r.extraColumns.length;
    extras.innerHTML=r.extraColumns.length?
      '<p class="due-import-extra"><strong>Additional columns detected:</strong> '+r.extraColumns.map(esc).join(', ')+'. Cerium cannot create searchable custom fields from this importer yet. Preserve their row values in Notes or explicitly choose to skip them.</p>':'';
    const out=$('results');out.hidden=false;
    out.innerHTML='<h3 class="import-subheading">Review import</h3>'+
      '<div class="import-stats"><span><strong>'+r.ready+'</strong> ready</span><span><strong>'+r.duplicates+'</strong> duplicates</span><span><strong>'+r.invalid+'</strong> need attention</span></div>'+
      '<p class="muted">Preview shows '+r.samples.length+' of '+r.total+' rows. Invalid and duplicate rows are skipped. No reminders, invoices or bank matches are created.</p>'+
      '<div class="table-scroll" tabindex="0"><table class="data-table"><thead><tr><th>Row</th><th>Customer</th><th>Amount</th><th>Due date</th><th>Result</th></tr></thead><tbody>'+
      r.samples.map(item=>'<tr><td>'+item.row+'</td><td>'+esc(item.customerName||'—')+'</td><td>'+esc(item.amount||'—')+'</td><td>'+esc(item.dueDate||'—')+'</td><td>'+esc(item.reason||({ready:'Ready',duplicate:'Already recorded',invalid:'Review needed'}[item.status]||item.status))+'</td></tr>').join('')+
      '</tbody></table></div>'+
      (r.errors.length?'<details class="import-errors"><summary>View row issues ('+r.invalid+')</summary><ul>'+
        r.errors.map(item=>'<li>Row '+item.row+': '+esc(item.reason)+'</li>').join('')+'</ul></details>':'');
    $('currency').textContent=r.currency;
    submit.textContent='Import '+r.ready+' reviewed '+(r.ready===1?'due':'dues');
    lock(false);
  }
  async function preview({resetMapping=false}={}){
    if(!current)return;
    if(resetMapping)mapping=null;
    const id=++sequence;latest=null;setError('');lock(true);
    setStatus('Checking spreadsheet. No data has been changed.');
    try{
      const result=await api.previewPaymentDueImport(request());
      if(id!==sequence)return;
      latest=result;mapping={...result.mapping};
      renderMapping();
      renderResults();
      setStatus('Preview complete. '+result.total+' rows checked.');
    }catch(error){
      if(id!==sequence)return;
      $('results').hidden=true;
      if(!mapping)$('mapping').hidden=true;
      setError(error.message||'The spreadsheet could not be processed.');
      setStatus('No data imported.');
    }finally{if(id===sequence)lock(false);}
  }
  const closer=()=>{if(!busy)dialog.close();};
  dialog.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click',closer));
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  dialog.addEventListener('close',()=>{sequence++;dialog.remove();},{once:true});
  $('file').addEventListener('change',async event=>{
    const file=event.target.files?.[0];
    if(!file)return;
    current=null;mapping=null;latest=null;
    $('layout').hidden=true;$('mapping').hidden=true;$('results').hidden=true;
    if(!/\.(csv|xlsx)$/i.test(file.name)||file.size===0||file.size>2*1024*1024){
      setError('Choose a .csv or .xlsx file up to 2 MB.');return;
    }
    lock(true);setStatus('Reading spreadsheet locally…');
    try{
      const content=await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onerror=()=>reject(new Error('Could not read this file.'));
        reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');
        reader.readAsDataURL(file);
      });
      current={filename:file.name,content};
      await preview({resetMapping:true});
    }catch(error){setError(error.message||'File reading failed.');}
    finally{lock(false);}
  });
  dialog.addEventListener('change',event=>{
    if(event.target.matches('[data-currency-confirm]')){lock(false);return;}
    const map=event.target.closest('[data-map]');
    if(map&&current){
      mapping[map.dataset.map]=map.value===''?null:Number(map.value);
      preview();
      return;
    }
    if(event.target.matches('[data-sheet],[data-header-row]')){preview({resetMapping:true});return;}
    if(event.target.matches('[data-date-format],[data-extra]')){preview();}
  });
  submit.addEventListener('click',async()=>{
    if(!current||!latest||busy||!latest.ready||!$('currency-confirm').checked)return;
    if(latest.extraColumns.length&&$('extra').value==='review'){
      setError('Choose what happens to the unmatched columns.');return;
    }
    lock(true);setError('');setStatus('Importing checked records…');
    try{
      const outcome=await api.commitPaymentDueImport({...request(),currencyConfirmed:true});
      setStatus(outcome.imported+' dues imported, '+outcome.duplicates+' duplicates, '+outcome.invalid+' invalid.');
      if(outcome.imported){await onComplete(outcome);dialog.close();}
      else{latest=outcome;renderResults();}
    }catch(error){setError(error.message||'Import failed. No changes were saved.');}
    finally{lock(false);}
  });
  dialog.showModal();
  $('file').focus();
}
