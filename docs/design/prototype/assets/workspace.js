/* Prodlike prototype – Scenario Workspace behaviour (scripted scenario engine) */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const GUEST = new URLSearchParams(location.search).get('guest');
if (GUEST) $('#guestTag').hidden = false;

/* ------------------------------------------------------------------ files */
const FILES = {
  discount: {
    path: 'src/discount.js',
    lang: 'js',
    ro: false,
    text: `// orders-service/src/discount.js
// Promo: "10% off on orders of Rs 1,000 or more"

const DISCOUNT_THRESHOLD = 1000; // Rs
const DISCOUNT_RATE = 0.10;

function applyDiscount(order) {
  if (order.total > DISCOUNT_THRESHOLD) {
    return order.total * (1 - DISCOUNT_RATE);
  }
  return order.total;
}

module.exports = { applyDiscount };
`,
  },
  index: {
    path: 'src/index.js',
    lang: 'js',
    ro: true,
    text: `const express = require('express');
const { applyDiscount } = require('./discount');
const payments = require('./payments-client');

const app = express();
app.use(express.json());

app.post('/orders', async (req, res) => {
  const total = applyDiscount(req.body);
  const receipt = await payments.charge(req.body.userId, total);
  res.status(201).json({ total, receipt });
});

app.listen(3000);
`,
  },
  test: {
    path: 'tests/discount.test.js',
    lang: 'js',
    ro: false,
    text: `const { applyDiscount } = require('../src/discount');

test('no discount below Rs 1000', () => {
  expect(applyDiscount({ total: 999 })).toBe(999);
});

test('10% off above Rs 1000', () => {
  expect(applyDiscount({ total: 1500 })).toBe(1350);
});

// TODO(BYTE-482): add a test for the boundary case (exactly Rs 1000)
`,
  },
  env: {
    path: 'deploy/payments.env',
    lang: 'env',
    ro: false,
    text: `# payments-service runtime config  (release train v1.4.2)
PAYMENT_PROVIDER_URL=https://bank-sim.internal/charge
PAYMENT_RETRIES=2
# changed in a91f3c2 "chore(payments): tune timeout"
PAYMENT_TIMEOUT_MS=50
`,
  },
  readme: {
    path: 'README.md',
    lang: 'md',
    ro: true,
    text: `# orders-service

Calculates order totals (incl. promotions) and charges customers
through payments-service.

## Run
  npm test        run unit tests
  git diff        see your changes
  logs <service>  tail production logs
  rollback        roll production back to the previous release
`,
  },
};
const ORIGINAL = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, f.text]));

/* ------------------------------------------------------------------ state */
const S = {
  file: 'discount',
  hints: 0,
  step: 0,
  t0: Date.now(),
  testsGreen: false,
  testRuns: 0,
  release: 'v1.4.1',
  deployed: false,
  strategy: null,
  incident: false,
  resolved: false,
  incidentAt: 0,
  resolvedAt: 0,
  method: null,
  busy: false,
  nodes: { web: 'ok', gw: 'ok', orders: 'ok', payments: 'ok', db: 'ok', bank: 'ok' },
  view: '3d',
};

/* ------------------------------------------------------------------ editor */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function highlight(src, lang) {
  if (lang === 'md') return esc(src).replace(/^(#.*)$/gm, '<span class="fn">$1</span>');
  const re =
    lang === 'env'
      ? /(#.*$)|(=)(.*$)/gm
      : /(\/\/.*$)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`[^`]*`)|\b(const|let|function|return|if|else|async|await|require|module|exports|new)\b|\b(\d+(?:\.\d+)?)\b|\b(applyDiscount|test|expect|toBe)\b/gm;
  let out = '',
    last = 0,
    m;
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index));
    if (lang === 'env')
      out += m[1] ? `<span class="c">${esc(m[1])}</span>` : `=<span class="s">${esc(m[3])}</span>`;
    else if (m[1]) out += `<span class="c">${esc(m[1])}</span>`;
    else if (m[2]) out += `<span class="s">${esc(m[2])}</span>`;
    else if (m[3]) out += `<span class="k">${m[3]}</span>`;
    else if (m[4]) out += `<span class="n">${m[4]}</span>`;
    else if (m[5]) out += `<span class="fn">${m[5]}</span>`;
    last = re.lastIndex;
  }
  return out + esc(src.slice(last)) + '\n';
}
const code = $('#code'),
  hl = $('#hl'),
  gutter = $('#gutter');
function paint() {
  const f = FILES[S.file];
  hl.innerHTML = highlight(f.text, f.lang);
  gutter.innerHTML = f.text
    .split('\n')
    .map((_, i) => i + 1)
    .join('<br>');
  const lines = f.text.split('\n').length;
  code.style.height = lines * 22 + 40 + 'px';
}
function openFile(id) {
  S.file = id;
  const f = FILES[id];
  code.value = f.text;
  code.readOnly = f.ro;
  $$('#tree .f').forEach((e) => e.classList.toggle('on', e.dataset.file === id));
  $('#fileTabs').innerHTML =
    `<button class="tab on">${f.path.split('/').pop()}${f.ro ? ' <span style="font-size:11px">(read-only)</span>' : ''}</button><span class="lbl" style="margin-left:auto">${f.path}</span>`;
  $('#fileInfo').textContent =
    `${f.lang === 'js' ? 'JavaScript' : f.lang === 'env' ? 'Env' : 'Markdown'} · UTF-8 · autosaved`;
  paint();
}
code.addEventListener('input', () => {
  FILES[S.file].text = code.value;
  paint();
  $$('#tree .f').forEach((e) =>
    e.classList.toggle('mod', FILES[e.dataset.file].text !== ORIGINAL[e.dataset.file]),
  );
  if (S.step < 1 && S.file !== 'readme') setStep(1);
  if (S.file !== 'env') S.testsGreen = false;
  refreshButtons();
  if (S.incident && !S.resolved) renderIncident();
});
code.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const p = code.selectionStart;
    code.setRangeText('  ', p, code.selectionEnd, 'end');
    code.dispatchEvent(new Event('input'));
  }
});
$$('#tree .f').forEach((e) => e.addEventListener('click', () => openFile(e.dataset.file)));

/* ------------------------------------------------------------------ checks */
const activeLines = (t) =>
  t
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
const isFixed = () => /total\s*>=\s*(DISCOUNT_THRESHOLD|1000)\b/.test(activeLines(FILES.discount.text));
const hasBoundaryTest = () =>
  /applyDiscount\(\s*\{\s*total:\s*1000\s*\}\s*\)/.test(activeLines(FILES.test.text));
const envFixed = () => {
  const m = FILES.env.text.match(/^PAYMENT_TIMEOUT_MS=(\d+)/m);
  return m && +m[1] >= 1000;
};

/* ------------------------------------------------------------------ steps / ui */
function setStep(n) {
  S.step = Math.max(S.step, n);
  $$('#steps span').forEach((s) => {
    const i = +s.dataset.s;
    s.className = i < S.step ? 'done' : i === S.step ? 'now' : '';
  });
  if (S.resolved) $$('#steps span').forEach((s) => (s.className = 'done'));
}
function refreshButtons() {
  $('#deployBtn').disabled = !S.testsGreen || S.deployed || S.busy;
  $('#runBtn').disabled = S.busy;
}
function showTab(name) {
  $$('.sys .tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === name));
  $$('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== name));
}
$$('.sys .tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
$$('[data-ttab]').forEach((t) =>
  t.addEventListener('click', () => {
    $$('[data-ttab]').forEach((x) => x.classList.toggle('on', x === t));
    $('#term').hidden = t.dataset.ttab !== 'term';
    $('#tests').hidden = t.dataset.ttab !== 'tests';
  }),
);
const showTerm = () => $$('[data-ttab]')[0].click();
const showTests = () => $$('[data-ttab]')[1].click();

/* ------------------------------------------------------------------ terminal */
const term = $('#term');
function out(html) {
  term.insertAdjacentHTML('beforeend', html + '<br>');
  term.scrollTop = term.scrollHeight;
}
out(
  '<span class="dim">Sandbox ready in 6.8s · container ctr-7f3a · non-root · CPU 1 · RAM 512MB · no network</span>',
);
out('<span class="dim">Type <b>help</b> to see permitted commands.</span>');

function runTests(silent) {
  S.testRuns++;
  const fixed = isFixed(),
    boundary = hasBoundaryTest();
  const fails = boundary && !fixed;
  const n = 14 + (boundary ? 1 : 0);
  let r = `<span class="dim">$ npm test</span><br>`;
  r += `<span class="ok">PASS</span> tests/cart.test.js <span class="dim">(9)</span><br>`;
  r += `<span class="ok">PASS</span> tests/orders.test.js <span class="dim">(3)</span><br>`;
  r += `${fails ? '<span class="bad">FAIL</span>' : '<span class="ok">PASS</span>'} tests/discount.test.js<br>`;
  r += `  <span class="ok">✓</span> no discount below Rs 1000<br>  <span class="ok">✓</span> 10% off above Rs 1000<br>`;
  if (boundary)
    r += fails
      ? `  <span class="bad">✕ applies discount at exactly Rs 1000</span><br>    <span class="bad">Expected: 900  Received: 1000</span><br>`
      : `  <span class="ok">✓</span> applies discount at exactly Rs 1000<br>`;
  r += `<br>Tests: ${fails ? `<span class="bad">1 failed</span>, ${n - 1} passed` : `<span class="ok">${n} passed</span>`}, ${n} total <span class="dim">· 1.9s</span>`;
  if (!boundary)
    r += `<br><span class="warn">⚠ Coverage note: no test exercises total = 1000 (see TODO in discount.test.js)</span>`;
  $('#tests').innerHTML = r;
  S.testsGreen = !fails;
  if (!silent) {
    showTests();
    out(
      `<span class="dim">$ npm test</span> → ${fails ? '<span class="bad">1 failed</span>' : `<span class="ok">${n} passed</span>`} <span class="dim">(see Test results)</span>`,
    );
    if (!fails) {
      setStep(2);
      if (S.step < 3) setStep(3);
      toast(
        fixed ? 'All tests pass. Ready to Commit & Deploy.' : 'Tests pass — but is the bug actually fixed?',
        fixed ? 'ok' : 'warn',
      );
    }
  }
  refreshButtons();
  return !fails;
}
$('#runBtn').addEventListener('click', () => runTests());

const CMDS = {
  help: () =>
    out(
      'Permitted: <b>npm test</b> · <b>git diff</b> · <b>git log</b> · <b>logs &lt;service&gt;</b> · <b>rollback</b> · <b>clear</b>',
    ),
  'npm test': () => {
    runTests();
  },
  'git diff': () => {
    const changed = Object.keys(FILES).filter((k) => FILES[k].text !== ORIGINAL[k]);
    if (!changed.length) return out('<span class="dim">No changes.</span>');
    changed.forEach((k) => {
      out(`<span class="fn" style="color:#7DD3FC">diff --git a/${FILES[k].path}</span>`);
      const a = ORIGINAL[k].split('\n'),
        b = FILES[k].text.split('\n');
      a.forEach((l, i) => {
        if (l !== b[i] && b[i] !== undefined) {
          out(`<span class="bad">- ${esc(l)}</span>`);
          out(`<span class="ok">+ ${esc(b[i])}</span>`);
        }
      });
      b.slice(a.length).forEach((l) => out(`<span class="ok">+ ${esc(l)}</span>`));
    });
  },
  'git log': () => {
    if (S.deployed)
      out(
        '<span class="warn">c41d9e0</span> fix(discount): include orders of exactly Rs 1000 <span class="dim">(you)</span>',
      );
    out(
      '<span class="warn">a91f3c2</span> chore(payments): tune timeout <span class="dim">(Usman · in release train v1.4.2)</span>',
    );
    out('<span class="warn">77be120</span> feat(cart): show savings line <span class="dim">(Sana)</span>');
    out('<span class="warn">5c0a4f1</span> release v1.4.1 <span class="dim">(ci-bot)</span>');
  },
  logs: (arg) => {
    const svc = arg || 'payments';
    if (S.incident && !S.resolved && svc.startsWith('pay')) {
      [
        'ERROR charge failed: ETIMEDOUT after 50ms (PAYMENT_TIMEOUT_MS=50)',
        'ERROR charge failed: ETIMEDOUT after 50ms',
        'WARN  retry 2/2 exhausted user=u_8812',
        'ERROR POST /orders 502 upstream payments-service',
        'ERROR charge failed: ETIMEDOUT after 50ms',
      ].forEach((l, i) =>
        out(
          `<span class="dim">19:${42 + i}:0${i}</span> <span class="${l.startsWith('WARN') ? 'warn' : 'bad'}">${l}</span>`,
        ),
      );
      out('<span class="dim">bank-sim p50 response time: 140ms</span>');
    } else out(`<span class="dim">19:40:12</span> INFO  ${svc}-service healthy · 0 errors in last 5m`);
  },
  rollback: () => doRollback(),
  clear: () => {
    term.innerHTML = '';
  },
};
$('#cmd').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const v = e.target.value.trim();
  e.target.value = '';
  if (!v) return;
  showTerm();
  out(`<span class="p">$</span> ${esc(v)}`);
  const [c0, c1, c2] = v.split(/\s+/);
  const key = CMDS[v] ? v : CMDS[c0 + ' ' + c1] ? c0 + ' ' + c1 : c0;
  if (key === 'logs') return CMDS.logs(c1);
  if (CMDS[key]) return CMDS[key](c2);
  out(`<span class="bad">"${esc(c0)}" is not permitted in this sandbox.</span> Type <b>help</b>.`);
});

/* ------------------------------------------------------------------ hints */
function hintText() {
  if (S.incident && !S.resolved)
    return 'The alert started right after release v1.4.2. Run <b>git log</b> and open <b>deploy/payments.env</b>: PAYMENT_TIMEOUT_MS was changed from 5000 to 50. Fastest safe recovery: <b>rollback</b>, then fix the config in a follow-up.';
  if (!isFixed())
    return S.hints === 0
      ? 'The bug is in <b>src/discount.js</b>. Look closely at the comparison that decides whether the discount applies.'
      : '<code>&gt;</code> excludes the threshold itself. “Rs 1,000 or more” means <code>&gt;=</code>.';
  if (!hasBoundaryTest())
    return 'Prove the fix: in <b>tests/discount.test.js</b> replace the TODO with a test that <code>applyDiscount({ total: 1000 })</code> returns 900.';
  return 'Run the tests, then Commit &amp; Deploy. A canary release limits the blast radius if something goes wrong.';
}
$('#hintBtn').addEventListener('click', () => {
  S.hints++;
  $('#hintN').textContent = S.hints;
  $('#hintUsed').textContent = S.hints;
  $('#hintText').innerHTML = hintText();
  openModal('hintModal');
});

/* ------------------------------------------------------------------ pipeline */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plog = $('#plog');
function stage(name, cls, txt) {
  const s = $(`[data-st="${name}"]`);
  s.className = 'stage ' + cls;
  s.querySelector('.st').textContent = txt;
}
function pl(html) {
  plog.insertAdjacentHTML('beforeend', html + '<br>');
}

$('#deployBtn').addEventListener('click', () => openModal('deployModal'));
$('#confirmDeploy').addEventListener('click', () => {
  S.strategy = document.querySelector('[name=strat]:checked').value;
  closeModal('deployModal');
  runPipeline({ hotfix: false });
});

async function runPipeline({ hotfix }) {
  S.busy = true;
  refreshButtons();
  showTab('pipe');
  ['build', 'lint', 'test', 'deploy'].forEach((s) => stage(s, '', 'waiting'));
  plog.innerHTML = '';
  pl(
    `<span style="color:#22D3EE">▶ pipeline #${hotfix ? 129 : 128}</span> · commit ${hotfix ? 'e5b77a2 fix(payments): restore 5000ms timeout' : 'c41d9e0 ' + esc($('#msg').value)}`,
  );
  for (const [s, msg] of [
    ['build', 'npm ci && npm run build'],
    ['lint', 'eslint src tests'],
  ]) {
    stage(s, 'run', 'running…');
    pl(`<span class="dim">[${s}]</span> ${msg}`);
    await sleep(900);
    stage(s, 'ok', '✓ passed');
    pl(`<span style="color:#22C55E">[${s}] ✓ ok</span>`);
  }
  stage('test', 'run', 'running…');
  pl('<span class="dim">[test]</span> npm test');
  await sleep(1000);
  if (!runTests(true)) {
    stage('test', 'fail', '✕ failed');
    stage('deploy', '', 'blocked');
    pl('<span style="color:#F87171">[test] ✕ 1 failing test — deployment blocked</span>');
    toast('Pipeline failed at Test. Deployment was blocked.', 'bad');
    S.busy = false;
    refreshButtons();
    return;
  }
  stage('test', 'ok', '✓ passed');
  pl('<span style="color:#22C55E">[test] ✓ all tests passed</span>');
  stage('deploy', 'run', 'deploying…');
  const newRel = hotfix ? 'v1.4.3' : 'v1.4.2';
  pl(`<span class="dim">[deploy]</span> strategy=${hotfix ? 'direct' : S.strategy} release=${newRel}`);
  showTab('map');
  setNodes({ orders: 'deploy', payments: 'deploy' });
  if (!hotfix) setStep(3);
  await sleep(2200);
  S.release = newRel;
  $('#release').textContent = newRel;
  setNodes({ orders: 'ok', payments: 'ok' });
  stage('deploy', 'ok', '✓ live');
  plogLater(
    `<span style="color:#22C55E">[deploy] ✓ ${newRel} live${!hotfix && S.strategy === 'canary' ? ' on 10% of traffic' : ''} · health check passed</span>`,
  );
  S.busy = false;
  if (hotfix) {
    resolve('hotfix');
    return;
  }
  S.deployed = true;
  refreshButtons();
  toast(`${newRel} deployed. Watch production…`, 'ok');
  out('<span class="dim">Watching production… (incidents may occur)</span>');
  await sleep(3500);
  triggerIncident();
}
function plogLater(h) {
  pl(h);
}

/* ------------------------------------------------------------------ incident */
function triggerIncident() {
  S.incident = true;
  S.incidentAt = Date.now();
  const canary = S.strategy === 'canary';
  setNodes({ payments: canary ? 'warn' : 'down', gw: 'warn' });
  setStep(4);
  $('#incCount').hidden = false;
  renderIncident();
  showTab('inc');
  toast(
    canary
      ? '⚠ ALERT: payments-service canary returning 5xx'
      : '🔥 ALERT: payments-service is down — checkout failing',
    'bad',
  );
}
function renderIncident() {
  const canary = S.strategy === 'canary';
  const env = envFixed();
  $('#incidents').innerHTML = `
    <div class="alert ${canary ? 'warn' : ''}">
      <div class="sev">${canary ? 'SEV-3 · DEGRADED' : 'SEV-2 · OUTAGE'} · <span id="incAge">0s</span> ago</div>
      <h4>payments-service ${canary ? '5xx on canary instances' : 'returning 5xx — checkout failing'}</h4>
      <div class="kv">Release: <b>v1.4.2</b> (deployed just before alert)<br>Error rate: <b>${canary ? '4.1% overall · 41% on canary' : '38%'}</b> (threshold 2%)<br>Customer impact: <b>${canary ? '~10% of checkouts' : 'all checkouts'}</b></div>
      <div class="row wrap mt2" style="gap:8px">
        <button class="wbtn" id="iLogs">View logs</button>
        <button class="wbtn danger" id="iRollback">⟲ Roll back to v1.4.1</button>
        <button class="wbtn" id="iEnv">Open payments.env</button>
        ${env ? '<button class="wbtn go" id="iHotfix">⇪ Deploy config hotfix</button>' : ''}
      </div>
    </div>
    <p class="small mt2" style="color:var(--d-muted)">Tip: investigate first (logs, <b>git log</b>), then restore service. Both rollback and a hotfix are valid.</p>`;
  $('#iLogs').onclick = () => {
    showTerm();
    out('<span class="p">$</span> logs payments');
    CMDS.logs('payments');
  };
  $('#iRollback').onclick = doRollback;
  $('#iEnv').onclick = () => openFile('env');
  if (env) $('#iHotfix').onclick = () => runPipeline({ hotfix: true });
}
async function doRollback() {
  if (!S.deployed)
    return out('<span class="dim">Nothing to roll back: production is already on v1.4.1.</span>');
  if (S.resolved) return out('<span class="dim">Service is already healthy.</span>');
  out('<span class="warn">⟲ Rolling back production to v1.4.1…</span>');
  setNodes({ orders: 'deploy', payments: 'deploy' });
  showTab('map');
  await sleep(2000);
  S.release = 'v1.4.1';
  $('#release').textContent = 'v1.4.1';
  out('<span class="ok">✓ v1.4.1 restored. Health checks passing.</span>');
  resolve('rollback');
}
function resolve(method) {
  S.resolved = true;
  S.method = method;
  S.resolvedAt = Date.now();
  setNodes({ web: 'ok', gw: 'ok', orders: 'ok', payments: 'ok', db: 'ok', bank: 'ok' });
  setStep(4);
  const mttr = Math.round((S.resolvedAt - S.incidentAt) / 1000);
  $('#incCount').hidden = true;
  $('#incidents').innerHTML = `
    <div class="alert resolved">
      <div class="sev">RESOLVED · ${method === 'rollback' ? 'rollback to v1.4.1' : 'config hotfix v1.4.3'}</div>
      <h4>Service restored in ${fmt(mttr)}</h4>
      <div class="kv">Error rate back to <b>0.4%</b>. Checkout healthy.${method === 'rollback' ? '<br><span style="color:var(--d-warn)">Note: rollback also reverted your discount fix — it will need re-shipping.</span>' : ''}</div>
      <button class="wbtn go mt2" onclick="finish()">✓ Finish attempt &amp; see debrief</button>
    </div>`;
  $('#deployBtn').hidden = true;
  $('#finishBtn').hidden = false;
  toast(`Service restored in ${fmt(mttr)}. Finish the attempt to see your debrief.`, 'ok');
}
function finish() {
  const mttr = Math.round((S.resolvedAt - S.incidentAt) / 1000);
  const r = {
    correctness: isFixed() ? 30 : 10,
    testing: hasBoundaryTest() ? 25 : S.testRuns > 0 ? 10 : 0,
    safety: S.strategy === 'canary' ? 20 : 14,
    recovery: mttr <= 120 ? 25 : mttr <= 300 ? 18 : 10,
    hints: S.hints,
    mttr,
    method: S.method,
    strategy: S.strategy,
    total_time: Math.round((Date.now() - S.t0) / 1000),
    fixed: isFixed(),
    boundary: hasBoundaryTest(),
  };
  try {
    localStorage.setItem('prodlike-result', JSON.stringify(r));
  } catch (e) {}
  location.href = 'debrief.html' + (GUEST ? '?guest=1' : '');
}
$('#finishBtn').addEventListener('click', finish);

/* ------------------------------------------------------------------ map */
const NODES = [
  { id: 'web', label: 'Web app', x: 0, y: 1.5 },
  { id: 'gw', label: 'API gateway', x: 2, y: 1.5 },
  { id: 'orders', label: 'orders-service', x: 4, y: 0.2 },
  { id: 'payments', label: 'payments-service', x: 4, y: 2.8 },
  { id: 'db', label: 'PostgreSQL', x: 6.2, y: 0.2 },
  { id: 'bank', label: 'Bank API (ext)', x: 6.2, y: 2.8 },
];
const EDGES = [
  ['web', 'gw'],
  ['gw', 'orders'],
  ['gw', 'payments'],
  ['orders', 'payments'],
  ['orders', 'db'],
  ['payments', 'bank'],
];
const COL = {
  ok: { top: '#166534', l: '#14532D', r: '#0F3D22', st: '#22C55E', txt: '✓ healthy' },
  deploy: { top: '#155E75', l: '#164E63', r: '#0E3A4A', st: '#22D3EE', txt: '⟳ deploying' },
  warn: { top: '#92400E', l: '#78350F', r: '#5C2A0B', st: '#F59E0B', txt: '▲ degraded' },
  down: { top: '#991B1B', l: '#7F1D1D', r: '#5F1515', st: '#F87171', txt: '✕ down' },
};
function setNodes(o) {
  Object.assign(S.nodes, o);
  renderMap();
}
// 2.5D oblique projection: x runs right (slight drop), y runs toward the viewer (slight left shift)
const ISO = (x, y) => [70 + x * 52 - y * 14, 46 + y * 52 + x * 8];
const P2 = (x, y) => [52 + x * 54, 58 + y * 62];
function renderMap() {
  const svg = $('#map');
  let h = '';
  const pos = (id) => {
    const n = NODES.find((n) => n.id === id);
    return S.view === '3d' ? ISO(n.x, n.y) : P2(n.x, n.y);
  };
  // edges
  EDGES.forEach(([a, b]) => {
    const [x1, y1] = pos(a),
      [x2, y2] = pos(b);
    const bad =
      [a, b].some((id) => S.nodes[id] === 'down' || S.nodes[id] === 'warn') && [a, b].includes('payments');
    const live = [a, b].some((id) => S.nodes[id] === 'deploy');
    const oy = S.view === '3d' ? 0 : 0;
    h += `<line x1="${x1}" y1="${y1 + oy}" x2="${x2}" y2="${y2 + oy}" stroke="#334155" stroke-width="2"/>`;
    h += `<line x1="${x1}" y1="${y1 + oy}" x2="${x2}" y2="${y2 + oy}" stroke="${bad ? '#F87171' : live ? '#22D3EE' : '#22C55E'}" stroke-opacity="${bad || live ? 0.9 : 0.35}" stroke-width="2" stroke-dasharray="5 7"><animate attributeName="stroke-dashoffset" from="24" to="0" dur="${bad ? 2.4 : 1}s" repeatCount="indefinite"/></line>`;
  });
  // nodes (draw back-to-front for 3D)
  const order = [...NODES].sort((a, b) => a.y - b.y || a.x - b.x);
  order.forEach((n) => {
    const st = S.nodes[n.id],
      c = COL[st];
    const pulse =
      st === 'down' || st === 'deploy'
        ? `<animate attributeName="stroke-opacity" values="1;.25;1" dur="${st === 'down' ? 1 : 1.4}s" repeatCount="indefinite"/>`
        : '';
    if (S.view === '3d') {
      const d = 0.42,
        e = 0.28,
        H = 22;
      const p = (dx, dy, z = 0) => {
        const [X, Y] = ISO(n.x + dx, n.y + dy);
        return `${X.toFixed(1)},${(Y - z).toFixed(1)}`;
      };
      const top = [p(-d, -e, H), p(d, -e, H), p(d, e, H), p(-d, e, H)].join(' ');
      const right = [p(d, -e, H), p(d, e, H), p(d, e), p(d, -e)].join(' ');
      const left = [p(-d, e, H), p(d, e, H), p(d, e), p(-d, e)].join(' ');
      h += `<g><polygon points="${right}" fill="${c.r}"/><polygon points="${left}" fill="${c.l}"/><polygon points="${top}" fill="${c.top}" stroke="${c.st}" stroke-width="2">${pulse}</polygon></g>`;
      const [X, Y] = ISO(n.x, n.y);
      h += `<text x="${X}" y="${Y + 30}" text-anchor="middle" font-family="Inter,sans-serif" font-size="11" font-weight="600" fill="#E2E8F0">${n.label}</text>`;
      h += `<text x="${X}" y="${Y + 43}"text-anchor="middle" font-family="Inter,sans-serif" font-size="10" font-weight="600" fill="${c.st}">${c.txt}</text>`;
    } else {
      const [X, Y] = P2(n.x, n.y),
        w = 92,
        hh = 40;
      h += `<rect x="${X - w / 2}" y="${Y - hh / 2}" width="${w}" height="${hh}" rx="8" fill="#1E293B" stroke="${c.st}" stroke-width="2">${pulse}</rect>`;
      h += `<text x="${X}" y="${Y - 2}" text-anchor="middle" font-family="Inter,sans-serif" font-size="10.5" font-weight="600" fill="#E2E8F0">${n.label}</text>`;
      h += `<text x="${X}" y="${Y + 12}" text-anchor="middle" font-family="Inter,sans-serif" font-size="10" font-weight="600" fill="${c.st}">${c.txt}</text>`;
    }
  });
  svg.innerHTML = h;
}
$$('.view-toggle button').forEach((b) =>
  b.addEventListener('click', () => {
    S.view = b.dataset.view;
    $$('.view-toggle button').forEach((x) => x.classList.toggle('on', x === b));
    renderMap();
  }),
);

/* ------------------------------------------------------------------ metrics + timer */
const series = { err: Array(30).fill(0.4), lat: Array(30).fill(180), rps: Array(30).fill(210) };
const rnd = (a, b) => a + Math.random() * (b - a);
function spark(id, arr, max, color) {
  const pts = arr
    .map((v, i) => `${(i / (arr.length - 1)) * 100},${28 - Math.min(v / max, 1) * 26}`)
    .join(' ');
  $(id).innerHTML =
    `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
}
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
function tick() {
  const bad = S.incident && !S.resolved,
    canary = S.strategy === 'canary';
  const e = bad ? (canary ? rnd(3.6, 4.6) : rnd(34, 41)) : Math.max(rnd(0.3, 0.6), series.err.at(-1) * 0.45);
  const l = bad
    ? canary
      ? rnd(260, 320)
      : rnd(950, 1300)
    : Math.max(rnd(170, 195), series.lat.at(-1) * 0.6);
  const r = bad ? rnd(185, 205) : rnd(200, 225);
  [
    ['err', e],
    ['lat', l],
    ['rps', r],
  ].forEach(([k, v]) => {
    series[k].push(v);
    series[k].shift();
  });
  $('#vErr').textContent = e.toFixed(1) + '%';
  $('#vLat').textContent = Math.round(l) + 'ms';
  $('#vRps').textContent = Math.round(r);
  $('#mErr').classList.toggle('alarm', e > 2);
  $('#mLat').classList.toggle('alarm', l > 600);
  spark('#sErr', series.err, 45, e > 2 ? '#F87171' : '#22C55E');
  spark('#sLat', series.lat, 1400, l > 600 ? '#F87171' : '#22D3EE');
  spark('#sRps', series.rps, 300, '#A5B4FC');
  $('#timer').textContent = fmt(Math.round((Date.now() - S.t0) / 1000));
  const age = $('#incAge');
  if (age) age.textContent = fmt(Math.round((Date.now() - S.incidentAt) / 1000));
}
setInterval(tick, 1000);

/* ------------------------------------------------------------------ init */
openFile('discount');
setStep(0);
renderMap();
tick();
refreshButtons();
