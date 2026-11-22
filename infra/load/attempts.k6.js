// k6 load test for NFR-04 (concurrent attempts) and NFR-02 (sandbox start and test speed).
// Every virtual user is one learner: sign up → start an attempt → run the tests → look around → end.
//
//   pnpm load:test                 (20 learners at once; see docs/evidence/load-test.md)
//   VUS=10 pnpm load:test          (fewer, for a small laptop)
//
// Start the API first with room for everyone:
//   SANDBOX_MAX_ACTIVE=20 SANDBOX_POOL_SIZE=3 AUTH_RATE_LIMIT=1000 node apps/api/dist/main.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://host.docker.internal:4000';
const VUS = Number(__ENV.VUS || 20);
const SCENARIO = __ENV.SCENARIO || 'discount-bug';

const startOk = new Rate('sandbox_start_ok');
const provisionMs = new Trend('sandbox_provision_ms', true);
const testsMs = new Trend('tests_run_ms', true);
const testsOk = new Rate('tests_run_ok');

// PROFILE=burst: every learner clicks "Start" in the same second (worst case).
// PROFILE=lab:   learners arrive over a minute, as when a class opens the lab.
const PROFILE = __ENV.PROFILE || 'burst';
const SCENARIOS = {
  burst: { executor: 'per-vu-iterations', vus: VUS, iterations: 1, maxDuration: '5m' },
  lab: {
    executor: 'constant-arrival-rate',
    rate: VUS,
    timeUnit: '60s',
    duration: '60s',
    preAllocatedVUs: VUS,
    maxVUs: VUS,
  },
};

export const options = {
  scenarios: { learners: SCENARIOS[PROFILE] },
  thresholds: {
    sandbox_start_ok: ['rate>0.95'], // NFR-02: more than 95% of sandboxes start
    sandbox_provision_ms: ['p(95)<10000'], // NFR-02: ready in under 10 s
    tests_run_ms: ['p(95)<30000'], // NFR-02: a test run in under 30 s
    tests_run_ok: ['rate>0.95'],
    http_req_failed: ['rate<0.05'],
  },
  summaryTrendStats: ['min', 'med', 'avg', 'p(90)', 'p(95)', 'max'],
};

const json = { headers: { 'content-type': 'application/json' } };

export default function () {
  const email = `load.${__VU}.${Date.now()}@load.test`;
  const reg = http.post(
    `${BASE}/auth/register`,
    JSON.stringify({ name: `Load Learner ${__VU}`, email, password: 'load-test-password' }),
    json,
  );
  check(reg, { 'signed up': (r) => r.status === 201 });

  const started = Date.now();
  const res = http.post(`${BASE}/attempts`, JSON.stringify({ scenario: SCENARIO }), {
    ...json,
    timeout: '60s',
  });
  const ok = res.status === 201;
  startOk.add(ok);
  if (!ok) {
    console.warn(`VU ${__VU}: start failed ${res.status} ${res.body}`);
    return;
  }
  const attempt = res.json();
  provisionMs.add(attempt.provisionedInMs ?? Date.now() - started);

  sleep(1 + Math.random() * 2); // the learner reads the ticket

  const t0 = Date.now();
  const tests = http.post(`${BASE}/attempts/${attempt.id}/tests`, null, { timeout: '60s' });
  testsMs.add(Date.now() - t0);
  testsOk.add(tests.status === 200 && tests.json('total') > 0);

  for (let i = 0; i < 3; i++) {
    sleep(1);
    check(http.get(`${BASE}/attempts/${attempt.id}`), { 'workspace loads': (r) => r.status === 200 });
  }
  check(http.post(`${BASE}/attempts/${attempt.id}/end`), { 'attempt ended': (r) => r.status === 200 });
}
