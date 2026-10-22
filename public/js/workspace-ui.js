/* Presentation only. Records and mutations remain owned by app.js / CeriumAPI. */
(() => {
  const names = { today:'Overview', leads:'Leads', followups:'Follow-ups', invoices:'Invoices', bank:'Bank matching', reviews:'Reviews', account:'Account & data', messages:'Messages' };
  const skip = document.createElement('a');
  skip.className = 'workspace-skip'; skip.href = '#main'; skip.textContent = 'Skip to workspace';
  document.body.prepend(skip);
  const main = document.getElementById('main');
  main.setAttribute('tabindex', '-1');
  const context = document.createElement('div');
  context.className = 'workspace-context';
  const brand = document.createElement('span'); brand.textContent = 'Workspace';
  const divider = document.createElement('span'); divider.textContent = '/'; divider.setAttribute('aria-hidden','true');
  const current = document.createElement('strong'); current.textContent = 'Overview';
  context.append(brand, divider, current);
  document.querySelector('.top-cmd-bar').prepend(context);
  for (const [id, name] of Object.entries(names)) {
    const section = document.getElementById('view-' + id);
    if (!section) continue;
    const title = section.querySelector('.view-title');
    if (title && id !== 'today') title.textContent = name;
    document.querySelectorAll('.sb-tab[data-tab="' + id + '"] > span:first-of-type').forEach(el => { el.textContent = name; });
    new MutationObserver(() => { if (!section.hidden) current.textContent = name; }).observe(section, { attributes:true, attributeFilter:['hidden'] });
  }
  const title = document.querySelector('#view-today .view-title');
  const name = document.getElementById('today-greet-name');
  title.replaceChildren(document.createTextNode('Welcome back, '), name, document.createTextNode('.'));
  document.querySelector('#view-today .view-sub').textContent = 'Your business at a glance. Keep track of customers, payments, and the work that needs your attention.';
  document.querySelectorAll('.kpi-card').forEach(el => {
    el.setAttribute('role','button'); el.tabIndex = 0;
    el.setAttribute('aria-label','View ' + names[el.dataset.tab]);
  });
  // Keep the morning brief available, but open directly into the working product.
  document.getElementById('welcome-screen').hidden = true;
  document.getElementById('workspace-shell').hidden = false;
})();
