import {MIGRATION_FIELDS} from './migration-fields.js';
import {escapeHTML as esc} from './workspace-model.js';

export function renderMigration(ws,view='import',readOnly=false){
  const title=`<div class="page-heading"><div><p class="eyebrow">UNIVERSAL MIGRATION</p><h1>Spreadsheet migration</h1><p class="page-description">Preview, map and validate your historical files before importing. Existing records are never overwritten.</p></div></div>`;
  
  if(view==='fields') {
    return title+`<section class="panel"><div class="panel-header"><div class="panel-title"><h2>Preserved custom fields</h2></div><span class="panel-count">${(ws.importMetadata||[]).length} records</span></div><div class="settings-content">${(ws.importMetadata||[]).map(r=>`<details class="payment-receipt"><summary><strong>${esc(r.target)}</strong> · ${esc(r.reference||r.recordId)}</summary><dl style="display:grid;grid-template-columns:auto 1fr;gap:6px 16px;margin:12px 0 0">${Object.entries(r.customFields).map(([k,v])=>`<dt style="font-weight:600;color:var(--mut)">${esc(k)}</dt><dd style="margin:0">${esc(v)}</dd>`).join('')}</dl></details>`).join('')||'<p class="muted">No imported custom fields yet. Any unmapped columns during spreadsheet import are safely preserved here and included in your account exports.</p>'}</div></section>`;
  }

  if(view==='mappings') {
    return title+`<section class="panel" data-migration-mappings><div class="panel-header"><div class="panel-title"><h2>Saved column mappings</h2></div><span class="panel-count">${(ws.migrationMappings||[]).length} saved</span></div><div class="settings-content">${(ws.migrationMappings||[]).map(m=>`<div class="task-row"><div class="row-details"><strong>${esc(m.name)}</strong><span class="row-meta">${esc(MIGRATION_FIELDS[m.target]?.label||m.target)} · ${Object.keys(m.mapping||{}).length} mapped columns</span></div>${readOnly?'':`<button class="text-button" data-delete-mapping="${m.id}">Delete</button>`}</div>`).join('')||'<p class="muted">No saved column mappings yet. Save a mapping after reviewing columns in Preview &amp; Import to reuse it for future files.</p>'}</div></section>`;
  }

  if(view==='types') {
    return title+`<div class="dashboard-grid">
      <section class="panel">
        <div class="panel-header"><div class="panel-title"><h2>Jobs &amp; appointments</h2></div><span class="badge blue">Schedule</span></div>
        <div class="settings-content">
          <p class="muted" style="margin-bottom:14px">Bring your booked work, service appointments, and calendar history directly into the Cerium dispatch board.</p>
          <ul style="margin:0 0 16px;padding-left:18px;font-size:12px;color:var(--mut);line-height:1.7">
            <li>Customer name, phone, and service address</li>
            <li>Appointment start time and scheduled end time</li>
            <li>Assigned crew technician or unassigned queue</li>
            <li>Work orders, job notes, and external job IDs</li>
          </ul>
          <a class="button secondary" href="#settings/migration/import" data-migration-select-type="jobs">Start Jobs Import &rarr;</a>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><div class="panel-title"><h2>Historical invoices</h2></div><span class="badge green">Billing</span></div>
        <div class="settings-content">
          <p class="muted" style="margin-bottom:14px">Migrate past invoices, itemized bills, and payment records without altering historical totals or tax snapshots.</p>
          <ul style="margin:0 0 16px;padding-left:18px;font-size:12px;color:var(--mut);line-height:1.7">
            <li>Pre-tax line amounts, tax rates, and final total</li>
            <li>Customer contact, billing address, and tax registration (GSTIN/Tax ID)</li>
            <li>Issue dates, payment terms, and recorded payment dates</li>
            <li>Preserves original invoice numbers and references</li>
          </ul>
          <a class="button secondary" href="#settings/migration/import" data-migration-select-type="invoices">Start Invoices Import &rarr;</a>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><div class="panel-title"><h2>Expenses &amp; inventory</h2></div><span class="badge orange">Operations</span></div>
        <div class="settings-content">
          <p class="muted" style="margin-bottom:14px">Import your supplier expenses, equipment purchases, material costs, and warehouse stock records.</p>
          <ul style="margin:0 0 16px;padding-left:18px;font-size:12px;color:var(--mut);line-height:1.7">
            <li>Expense date, description, amount, and receipt reference</li>
            <li>Inventory item name, SKU, stock quantity, and unit of measure</li>
            <li>Automatic category mapping and cost tracking</li>
          </ul>
          <a class="button secondary" href="#settings/migration/import" data-migration-select-type="expenses">Start Expenses &amp; Inventory Import &rarr;</a>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><div class="panel-title"><h2>Customers &amp; leads</h2></div><span class="badge purple">CRM</span></div>
        <div class="settings-content">
          <p class="muted" style="margin-bottom:14px">Bring your contacts, past clients, lead inquiries, and pipeline estimates into one central customer database.</p>
          <ul style="margin:0 0 16px;padding-left:18px;font-size:12px;color:var(--mut);line-height:1.7">
            <li>Name, email, phone, and physical address</li>
            <li>Lead acquisition source and estimated deal value</li>
            <li>Next follow-up date and customer history notes</li>
          </ul>
          <a class="button secondary" href="#settings/migration/import" data-migration-select-type="leads">Start Leads Import &rarr;</a>
        </div>
      </section>
    </div>`;
  }

  if(view==='advanced') {
    return title+`<div class="settings-grid">
      <section class="panel">
        <div class="panel-header"><div class="panel-title"><h2>Advanced file understanding</h2></div></div>
        <div class="settings-content">
          <div class="task-row">
            <div class="row-details">
              <strong>1. Multiple-sheet selection</strong>
              <p class="muted" style="margin:4px 0 0">Excel workbooks (.xlsx) with multiple tabs are parsed cleanly. Select any sheet index from the dropdown to preview and import records from that specific tab.</p>
            </div>
          </div>
          <div class="task-row">
            <div class="row-details">
              <strong>2. Header-row detection</strong>
              <p class="muted" style="margin:4px 0 0">Cerium scans up to the first 10 rows to detect your table headers automatically, skipping cover pages, title banners, and blank introductory rows.</p>
            </div>
          </div>
          <div class="task-row">
            <div class="row-details">
              <strong>3. Arbitrary column mapping</strong>
              <p class="muted" style="margin:4px 0 0">No rigid template required. Match any spreadsheet header to Cerium fields using smart aliases or manual dropdown overrides.</p>
            </div>
          </div>
          <div class="task-row">
            <div class="row-details">
              <strong>4. Preserve additional custom fields</strong>
              <p class="muted" style="margin:4px 0 0">Unmapped columns are never discarded. They are preserved in record metadata and included in full data exports.</p>
            </div>
          </div>
          <div class="task-row">
            <div class="row-details">
              <strong>5. Saved import mappings</strong>
              <p class="muted" style="margin:4px 0 0">Save column associations once and reuse them for weekly or monthly imports from the same accounting or CRM software.</p>
            </div>
          </div>
          <div class="task-row">
            <div class="row-details">
              <strong>6. Advanced duplicate detection</strong>
              <p class="muted" style="margin:4px 0 0">Prevents duplicate imports using phone numbers, emails, customer names, and external invoice references without blocking valid new records.</p>
            </div>
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><div class="panel-title"><h2>Migration status</h2></div></div>
        <div class="settings-content">
          <div style="display:grid;gap:16px">
            <div class="report-stat"><span>Supported formats</span><strong>.XLSX &amp; .CSV</strong><small>Max 2 MB / 2,000 rows</small></div>
            <div class="report-stat"><span>Saved mapping presets</span><strong>${(ws.migrationMappings||[]).length}</strong><small>Active in workspace</small></div>
            <div class="report-stat"><span>Preserved custom fields</span><strong>${(ws.importMetadata||[]).length}</strong><small>Stored records</small></div>
          </div>
          <div style="margin-top:20px">
            <a class="button primary" href="#settings/migration/import" style="width:100%;text-align:center">Launch universal import &rarr;</a>
          </div>
        </div>
      </section>
    </div>`;
  }

  return title+`<section class="panel" data-migration-page><form class="settings-content form-grid" data-migration-form>
    <label class="field">Record type<select name="target">${Object.entries(MIGRATION_FIELDS).map(([id,s])=>`<option value="${id}">${esc(s.label)}</option>`).join('')}</select></label>
    <label class="field">File · CSV or XLSX, up to 2 MB<input type="file" name="file" accept=".csv,.xlsx" required></label>
    <label class="field">Header row<select name="headerRow"><option value="auto">Detect automatically</option>${Array.from({length:10},(_,i)=>`<option>${i+1}</option>`).join('')}</select></label>
    <label class="field">Worksheet<select name="sheetIndex"><option value="0">First worksheet</option></select></label>
    <label class="field">Date format<select name="dateFormat"><option value="ISO">YYYY-MM-DD</option><option value="DMY">DD/MM/YYYY</option><option value="MDY">MM/DD/YYYY</option></select></label>
    <label class="field">Saved mapping<select name="mappingId"><option value="">Detect / map columns</option>${(ws.migrationMappings||[]).map(m=>`<option value="${m.id}" data-target="${m.target}">${esc(m.name)} (${esc(m.target)})</option>`).join('')}</select></label>
    <div class="full-width"><button class="button primary" type="submit" ${readOnly?'disabled':''}>Preview file</button></div>
    <p class="form-error full-width" role="alert" data-migration-error hidden></p>
    </form><div class="settings-content" data-migration-columns></div><div class="settings-content" data-migration-preview role="status"></div>
    <div class="settings-content subview-actions"><label class="field">Mapping name<input data-mapping-name maxlength="80"></label><button class="button secondary" data-save-mapping disabled>Save mapping</button><button class="button primary" data-commit-migration disabled>Import reviewed records</button></div>
    <p class="settings-content muted">Up to 2,000 rows and 40 columns per import. Unmapped columns are retained as custom fields and included in exports. Invoice amount is the pre-tax line amount; totals and country tax rules are validated. Mixed invoice currencies require separate workspaces. Completed historical jobs do not generate new invoices. Duplicate contacts, record fingerprints and external references are skipped.</p></section>`;
}

export function initializeMigration({root,api,ws,refresh,readOnly,toast}){
  root.querySelector('[data-migration-mappings]')?.addEventListener('click',async event=>{
    const b=event.target.closest('[data-delete-mapping]');if(!b||readOnly()||!confirm('Delete this saved mapping?'))return;
    try{await api.deleteMigrationMapping(b.dataset.deleteMapping);await refresh();}catch(e){toast(e.message,true);}
  });
  const page=root.querySelector('[data-migration-page]');if(!page)return;
  const form=page.querySelector('form'),columns=page.querySelector('[data-migration-columns]'),output=page.querySelector('[data-migration-preview]'),error=page.querySelector('[data-migration-error]'),commit=page.querySelector('[data-commit-migration]'),save=page.querySelector('[data-save-mapping]');
  let upload=null,preview=null,reviewed=null,busy=false,revision=0;
  const invalidate=()=>{revision++;preview=null;reviewed=null;commit.disabled=true;save.disabled=true;};
  const mapping=()=>Object.fromEntries([...columns.querySelectorAll('[data-map-field]')].map(s=>[s.dataset.mapField,s.value===''?null:Number(s.value)]));
  form.addEventListener('change',event=>{
    invalidate();
    if(['file','target','sheetIndex','headerRow','mappingId'].includes(event.target.name))columns.innerHTML='';
    if(event.target.name==='file'){upload=null;form.elements.sheetIndex.innerHTML='<option value="0">First worksheet</option>';}
  });
  columns.addEventListener('change',()=>{form.elements.mappingId.value='';invalidate();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||readOnly())return;busy=true;const currentRevision=revision;error.hidden=true;commit.disabled=true;save.disabled=true;
    try{
      const file=form.elements.file.files[0];if(!file||file.size>2*1024*1024)throw Error('Choose a file of at most 2 MB.');
      if(!upload){const bytes=new Uint8Array(await file.arrayBuffer());if(currentRevision!==revision)return;let text='';for(const byte of bytes)text+=String.fromCharCode(byte);upload={filename:file.name,content:btoa(text)};}
      const payload={...upload,target:form.elements.target.value,sheetIndex:Number(form.elements.sheetIndex.value),headerRow:form.elements.headerRow.value==='auto'?'auto':Number(form.elements.headerRow.value),dateFormat:form.elements.dateFormat.value};
      if(form.elements.mappingId.value)payload.mappingId=form.elements.mappingId.value;
      else if(columns.querySelector('[data-map-field]'))payload.mapping=mapping();
      const response=await api.migration('preview',payload);if(currentRevision!==revision)return;preview=response;reviewed={...payload,mapping:preview.mapping,headerRow:preview.headerRow};delete reviewed.mappingId;
      form.elements.sheetIndex.innerHTML=preview.sheets.map((name,i)=>`<option value="${i}" ${i===preview.sheetIndex?'selected':''}>${esc(name)}</option>`).join('');
      const schema=MIGRATION_FIELDS[payload.target];
      columns.innerHTML=`<h2>Column mapping · detected row ${preview.headerRow}</h2><div class="form-grid">${schema.fields.map(field=>`<label class="field">${esc(field)}${schema.required.includes(field)?' (required)':''}<select data-map-field="${field}"><option value="">Preserve as custom / not mapped</option>${preview.headers.map((h,i)=>`<option value="${i}" ${preview.mapping[field]===i?'selected':''}>${i+1}. ${esc(h||'Unnamed column')}</option>`).join('')}</select></label>`).join('')}</div><p class="muted">After changing mappings, preview again before importing.</p>`;
      output.innerHTML=`<h2>${preview.ready} ready · ${preview.duplicates} duplicates · ${preview.invalid} invalid</h2>${preview.missing.length?`<p>Map required fields: ${esc(preview.missing.join(', '))}</p>`:''}<div class="table-scroll"><table class="data-table"><thead><tr><th>Row</th><th>Status</th><th>Details</th></tr></thead><tbody>${preview.rows.map(r=>`<tr><td>${r.row}</td><td>${r.status}</td><td>${esc(r.reason||Object.values(r.data).slice(0,4).join(' · '))}</td></tr>`).join('')}</tbody></table></div><p>Showing up to 100 preview rows. All ${preview.total} rows were checked.</p>`;
      commit.disabled=preview.invalid>0||preview.missing.length>0||!preview.ready;save.disabled=preview.missing.length>0;
      commit.textContent='Import '+preview.ready+' reviewed records';
    }catch(err){invalidate();error.textContent=err.message;error.hidden=false;}finally{busy=false;}
  });
  save.addEventListener('click',async()=>{
    if(!preview||busy||readOnly())return;busy=true;
    try{await api.saveMigrationMapping({name:page.querySelector('[data-mapping-name]').value,target:reviewed.target,headers:preview.headers,mapping:preview.mapping});toast('Mapping saved. It is available in Saved Mappings.');}catch(e){error.textContent=e.message;error.hidden=false;}finally{busy=false;}
  });
  commit.addEventListener('click',async()=>{
    if(!preview||!reviewed||busy||commit.disabled||readOnly())return;busy=true;commit.disabled=true;
    try{const result=await api.migration('commit',{...reviewed,approved:true});await refresh();toast(result.imported+' records imported. '+result.duplicates+' duplicates skipped.');}
    catch(e){error.textContent=e.message;error.hidden=false;invalidate();}finally{busy=false;}
  });
}
