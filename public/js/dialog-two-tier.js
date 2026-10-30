/* CERIUM Design D: reusable two-tier navigation for multi-section workspace dialogs.
 * No form inputs are cloned or re-created. Native forms, validation, and module
 * event handlers keep ownership of their original elements.
 */
(() => {
  const enhanced = new WeakMap();
  const bound = new WeakSet();
  const field = (root, name) => {
    const input = [...root.querySelectorAll('[name]')].find(el => el.name === name);
    return input?.closest('label') || input?.closest('.field') || input || null;
  };
  const pick = (root, names = [], selectors = []) => {
    const found = [
      ...names.map(name => field(root, name)),
      ...selectors.flatMap(selector => [...root.querySelectorAll(selector)])
    ];
    return [...new Set(found.filter(Boolean))];
  };
  const view = (label, names = [], selectors = []) => ({label, names, selectors});
  const group = (label, views) => ({label, views});

  function configuration(dialog) {
    const id = dialog.id;
    if (id === 'record-dialog') {
      const root = dialog.querySelector('#record-fields');
      if (!root?.children.length) return null;
      const names = new Set([...root.querySelectorAll('[name]')].map(el => el.name));
      if (names.has('customerGstin') || names.has('supplyDate') || names.has('amount')) {
        return {root, groups: [
          group('Customer', [
            view('Contact', ['customerName','customerEmail','customerAddress']),
            view('Work', ['jobTitle','notes'])
          ]),
          group('Invoice', [
            view('Amount & terms', ['amount','terms','status']),
            view('Tax & payment', ['customerGstin','placeOfSupply','hsnSac','gstRate'],
              ['.invoice-local-fields','.invoice-billing-section'])
          ])
        ]};
      }
      if (names.has('stage')) {
        return {root, groups: [
          group('Customer', [
            view('Contact', ['name','email','phone']),
            view('Address & notes', ['address','notes'])
          ]),
          group('Sales', [
            view('Pipeline', ['stage','source','value']),
            view('Follow-up', ['nextFollowUp','createReminder'])
          ])
        ]};
      }
      if (names.has('task')) {
        return {root, groups: [
          group('Follow-up', [
            view('Task', ['task','dueDate']),
            view('Channel', ['channel'])
          ]),
          group('Customer', [
            view('Contact', ['contactName','phone'])
          ])
        ]};
      }
      // A short review-request editor does not need navigation.
      return null;
    }
    if (id === 'cerium-job-dialog') {
      const root = dialog.querySelector('[data-job-form="job"] .jobs-modal-body');
      if (!root) return null;
      return {root, groups: [
        group('Job', [
          view('Customer', ['title','customerName','leadId']),
          view('Contact', ['customerPhone','customerEmail','address'])
        ]),
        group('Schedule', [
          view('Appointment', ['startAt','endAt','workerId']),
          view('Status & notes', ['status','notes'])
        ]),
        group('Billing', [
          view('Line items', [], ['.jobs-billing']),
          view('Linked invoice', [], ['.jobs-linked-invoice'])
        ])
      ]};
    }
    if (id === 'cerium-quote-dialog') {
      const root = dialog.querySelector('[data-quote-form="edit"] .quotes-modal-body');
      if (!root) return null; // Link-share and confirmation dialogs stay compact.
      return {root, groups: [
        group('Customer', [
          view('Details', ['leadId','customerName','customerEmail','customerPhone']),
          view('Service', ['title','address','notes'])
        ]),
        group('Estimate', [
          view('Line items', [], ['.quotes-items-head','[data-quote-items]']),
          view('Total', [], ['.quotes-total-actions'])
        ])
      ]};
    }
    if (id === 'workspace-customizer-dialog') {
      const root = dialog.querySelector('#workspace-preferences-form');
      if (!root) return null;
      return {root, groups: [
        group('Setup', [
          view('Business type', [], ['.ws-config-form > .ws-custom-field']),
          view('Assistant', [], ['.ws-recommender'])
        ]),
        group('Workspace', [
          view('Modules', [], ['.ws-module-fieldset']),
          view('Card order', [], ['.ws-module-order'])
        ])
      ]};
    }
    if (id === 'lead-import-dialog') {
      const root = dialog.querySelector('.import-content');
      if (!root) return null;
      return {root, jump: true, groups: [
        group('Prepare', [
          view('Upload', [], ['#lead-import-file']),
          view('File settings', [], ['#lead-import-layout'])
        ]),
        group('Review', [
          view('Map columns', [], ['#lead-import-mapping']),
          view('Results', [], ['#lead-import-results'])
        ])
      ]};
    }
    if (id === 'due-import-dialog') {
      const root = dialog.querySelector('.import-content');
      if (!root) return null;
      return {root, jump: true, groups: [
        group('Prepare', [
          view('Upload', [], ['[data-file]']),
          view('File settings', [], ['[data-layout]'])
        ]),
        group('Review', [
          view('Map columns', [], ['[data-mapping]']),
          view('Results & currency', [], ['[data-results]','[data-currency-confirm]'])
        ])
      ]};
    }
    return null;
  }

  function enhance(dialog) {
    if (!dialog.open) return;
    const config = configuration(dialog);
    if (!config) return;
    const previous = enhanced.get(dialog);
    const firstControl = config.root.querySelector('input,select,textarea,button');
    if (previous && previous.root === config.root && previous.firstControl === firstControl) return;
    previous?.nav.remove();
    previous?.targets.forEach(node => node.classList.remove('cerium-dialog-tier-hidden'));

    const groups = config.groups.map(item => ({
      label: item.label,
      views: item.views.map(v => ({
        label: v.label,
        nodes: pick(config.root, v.names, v.selectors)
      })).filter(v => v.nodes.length)
    })).filter(item => item.views.length);
    if (groups.length < 2) return;
    const targets = [...new Set(groups.flatMap(g => g.views.flatMap(v => v.nodes)))];
    const nav = document.createElement('div');
    nav.className = 'cerium-dialog-navigation';
    nav.setAttribute('aria-label', 'Dialog sections');
    const primary = document.createElement('nav');
    primary.className = 'cerium-dialog-tier-one';
    primary.setAttribute('aria-label', 'Dialog primary sections');
    const secondary = document.createElement('nav');
    secondary.className = 'cerium-dialog-tier-two';
    secondary.setAttribute('aria-label', 'Dialog subsections');
    nav.append(primary, secondary);
    config.root.before(nav);
    dialog.classList.add('cerium-has-dialog-tabs');

    const current = {root: config.root, firstControl, targets, nav, groups,
      jump: Boolean(config.jump), primaryIndex: 0, subIndex: 0};
    enhanced.set(dialog, current);

    const button = (label, active, click, tier) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'cerium-dialog-tier-tab' + (active ? ' active' : '');
      el.textContent = label;
      el.setAttribute('aria-pressed', String(active));
      el.addEventListener('click', click);
      if (tier === 2) el.classList.add('cerium-dialog-subtab');
      return el;
    };
    const activate = (primaryIndex, subIndex = 0) => {
      current.primaryIndex = primaryIndex;
      current.subIndex = subIndex;
      const active = groups[primaryIndex].views[subIndex];
      primary.replaceChildren(...groups.map((g, index) =>
        button(g.label, index === primaryIndex, () => activate(index), 1)));
      secondary.replaceChildren(...groups[primaryIndex].views.map((v, index) =>
        button(v.label, index === subIndex, () => activate(primaryIndex, index), 2)));
      if (!current.jump) {
        const visible = new Set(active.nodes);
        // A matching child of a selected section is already visible through its parent.
        current.targets.forEach(node => node.classList.toggle('cerium-dialog-tier-hidden', !visible.has(node)));
      } else {
        const first = active.nodes.find(node => !node.hidden && !node.closest('[hidden]'));
        if (first && document.activeElement?.closest('.cerium-dialog-navigation')) {
          first.scrollIntoView({block: 'nearest', behavior: 'smooth'});
        }
      }
    };
    current.activate = activate;
    // Preserve the field focused by the module when its dialog first opens.
    const focused = document.activeElement;
    let initial = [0, 0];
    if (focused && config.root.contains(focused)) {
      groups.some((g, i) => g.views.some((v, j) => {
        if (!v.nodes.some(node => node === focused || node.contains(focused))) return false;
        initial = [i, j];
        return true;
      }));
    }
    activate(...initial);
    if (!bound.has(dialog)) {
      bound.add(dialog);
      // Native constraint validation fires before submit. Reveal the input's
      // original section so browser errors can be focused and understood.
      dialog.addEventListener('invalid', event => {
        const state = enhanced.get(dialog);
        if (!state || state.jump || state.validationScheduled) return;
        state.validationScheduled = true;
        queueMicrotask(() => {state.validationScheduled = false;});
        for (let i = 0; i < state.groups.length; i++) {
          const index = state.groups[i].views.findIndex(v =>
            v.nodes.some(node => node === event.target || node.contains(event.target)));
          if (index !== -1) {
            state.activate(i, index);
            break;
          }
        }
      }, true);
    }
  }
  let scheduled = false;
  const scan = () => {
    scheduled = false;
    document.querySelectorAll('dialog[open]').forEach(enhance);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(scan);
  };
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['open']
  });
  schedule();
})();