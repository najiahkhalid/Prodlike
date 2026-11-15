/* Shared prototype helpers: icons, sidebar, toasts, modals */
const ICONS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  users:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.5 0 4 1.5 4.8 4"/>',
  build: '<path d="M14 4l6 6-10 10H4v-6z"/><path d="M12 6l6 6"/>',
  report: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h8"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}
const LOGO_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 17l6-6-6-6"/><path d="M12 19h8"/></svg>`;

function renderSidebar(active, role = 'learner') {
  const el = document.getElementById('sidebar');
  if (!el) return;
  const learner = [
    ['dashboard.html', 'home', 'Dashboard'],
    ['catalogue.html', 'grid', 'Scenarios'],
    ['progress', 'chart', 'Progress History'],
    ['profile', 'user', 'Profile & Settings'],
  ];
  const instructor = [
    ['instructor.html', 'home', 'Instructor Dashboard'],
    ['cohorts', 'users', 'Cohorts'],
    ['builder', 'build', 'Scenario Builder'],
    ['reports', 'report', 'Learner Reports'],
    ['settings', 'gear', 'Account Settings'],
  ];
  const items = role === 'instructor' ? instructor : learner;
  const link = ([href, ic, label]) => {
    const real = href.endsWith('.html');
    return `<a class="side-link ${active === label ? 'active' : ''}" href="${real ? href : '#'}" ${real ? '' : `data-soon="${label}"`}>${icon(ic)}${label}</a>`;
  };
  el.innerHTML = `
    <a class="logo" href="index.html"><span class="logo-mark">${LOGO_SVG}</span>Prodlike</a>
    <div class="side-label">${role === 'instructor' ? 'Instructor' : 'Learner'}</div>
    ${items.map(link).join('')}
    <div class="side-label">Switch view (prototype)</div>
    ${
      role === 'instructor'
        ? `<a class="side-link" href="dashboard.html">${icon('user')}Learner view</a>`
        : `<a class="side-link" href="instructor.html">${icon('users')}Instructor view</a>`
    }
    <div class="user">
      <span class="avatar">${role === 'instructor' ? 'SM' : 'AR'}</span>
      <div><div style="color:#fff;font-weight:600">${role === 'instructor' ? 'Dr. Sara Malik' : 'Ali Raza'}</div><div style="color:#64748B">${role === 'instructor' ? 'Instructor · SEECS' : 'Learner · BSCS-12'}</div></div>
    </div>`;
  el.querySelectorAll('[data-soon]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      toast(`"${a.dataset.soon}" is out of scope for this prototype (shown in wireframes / sitemap).`);
    }),
  );
}

function toast(msg, kind = '') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.setAttribute('role', 'status');
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), 3800);
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape')
    document.querySelectorAll('.modal-bg.open').forEach((m) => m.classList.remove('open'));
});

/* Any element with data-toast shows a message instead of navigating */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-toast]');
  if (t) {
    e.preventDefault();
    toast(t.dataset.toast, t.dataset.kind || '');
  }
});
