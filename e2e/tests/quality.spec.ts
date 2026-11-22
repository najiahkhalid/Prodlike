import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ADMIN, finishTour, logIn, signUp, uniqueEmail } from './helpers';

/**
 * Phase 6B quality gates on the production build (docs/evidence):
 *   NFR-07 accessibility: axe (WCAG 2.1 A/AA), no serious or critical violations; keyboard-only use.
 *   NFR-01 performance:   largest contentful paint under 2.5 s on key pages.
 *   NFR-08 responsive:    no horizontal scrolling at 768 px.
 *   Security:             the Content-Security-Policy never blocks anything the app needs.
 */
test.setTimeout(150_000);

const LCP_BUDGET_MS = 2500;
const summary: { page: string; violations: Record<string, number>; lcpMs?: number }[] = [];

test.afterAll(() => {
  const dir = join(__dirname, '..', 'test-results');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'quality-summary.json'), JSON.stringify(summary, null, 2));
});

/** Fail on any CSP violation or uncaught page error. */
function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to (load|execute|connect|apply)/i.test(m.text()))
      problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  return problems;
}

async function expectAccessible(page: Page, name: string, info: TestInfo) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  await info.attach(`axe-${name}.json`, {
    body: JSON.stringify(results.violations, null, 2),
    contentType: 'application/json',
  });
  const dir = join(__dirname, '..', 'test-results', 'axe');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(results.violations, null, 2));
  const counts: Record<string, number> = {};
  for (const v of results.violations)
    counts[v.impact ?? 'unknown'] = (counts[v.impact ?? 'unknown'] ?? 0) + 1;
  summary.push({ page: name, violations: counts });
  const blocking = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} → ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join(' | ')}`,
    );
  expect.soft(blocking, `accessibility of ${name}`).toEqual([]);
}

/** Largest contentful paint of the page that was just loaded. */
async function lcpOf(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let value = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) value = e.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        setTimeout(() => resolve(value), 400);
      }),
  );
}

async function visit(page: Page, path: string, name: string, info: TestInfo, opts: { lcp?: boolean } = {}) {
  await page.goto(path, { waitUntil: 'load' });
  await expect(page.locator('h1').first()).toBeVisible();
  if (opts.lcp) {
    const ms = await lcpOf(page);
    summary.push({ page: `${name} (LCP)`, violations: {}, lcpMs: Math.round(ms) });
    expect.soft(ms, `LCP of ${name}`).toBeLessThan(LCP_BUDGET_MS);
  }
  await expectAccessible(page, name, info);
}

async function noHorizontalScroll(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'load' });
  await expect(page.locator('h1').first()).toBeVisible();
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect.soft(scroll, `horizontal scroll on ${path} at 768 px`).toBeLessThanOrEqual(client + 1);
}

test('public pages: accessible, fast, responsive', async ({ page }, info) => {
  const problems = watchConsole(page);
  await visit(page, '/', 'landing', info, { lcp: true });
  await visit(page, '/login', 'login', info, { lcp: true });
  await visit(page, '/signup', 'signup', info);
  await visit(page, '/forgot-password', 'forgot-password', info);
  await page.setViewportSize({ width: 768, height: 1024 });
  for (const path of ['/', '/login', '/signup']) await noHorizontalScroll(page, path);
  expect(problems).toEqual([]);
});

test('learner pages: accessible, fast, responsive', async ({ page }, info) => {
  const problems = watchConsole(page);
  await signUp(page, { name: 'Quality Learner', email: uniqueEmail('qa') });
  await finishTour(page);
  await visit(page, '/dashboard', 'dashboard', info, { lcp: true });
  await visit(page, '/scenarios', 'catalogue', info, { lcp: true });
  await visit(page, '/scenarios/discount-bug', 'brief', info, { lcp: true });
  await visit(page, '/progress', 'progress', info);
  await visit(page, '/settings', 'settings', info);
  await page.setViewportSize({ width: 768, height: 1024 });
  for (const path of ['/dashboard', '/scenarios', '/scenarios/discount-bug', '/progress', '/settings']) {
    await noHorizontalScroll(page, path);
  }
  expect(problems).toEqual([]);
});

test('instructor pages: accessible, fast, responsive', async ({ page }, info) => {
  const problems = watchConsole(page);
  await signUp(page, { name: 'Quality Teacher', email: uniqueEmail('qat'), role: 'Instructor' });
  await expect(page).toHaveURL(/\/instructor$/);
  const cohort = await (
    await page.request.post('/api/instructor/cohorts', { data: { name: 'QA Lab' } })
  ).json();
  const assigned = await (
    await page.request.post(`/api/instructor/cohorts/${cohort.id}/assignments`, {
      data: { scenario: 'discount-bug' },
    })
  ).json();
  const assignmentId = assigned.assignments[0].id as string;

  await visit(page, '/instructor', 'instructor-dashboard', info, { lcp: true });
  await visit(page, '/instructor/cohorts', 'classes', info);
  await visit(page, '/instructor/reports', 'reports', info);
  await visit(page, `/instructor/assignments/${assignmentId}`, 'results', info);
  await visit(page, '/instructor/builder', 'builder', info);
  await page.goto('/instructor');
  await page.getByRole('button', { name: 'Assign scenario' }).click();
  await expect(page.getByRole('dialog', { name: 'Assign a scenario' })).toBeVisible();
  await expectAccessible(page, 'assign-dialog', info);
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 768, height: 1024 });
  for (const path of [
    '/instructor',
    '/instructor/cohorts',
    `/instructor/assignments/${assignmentId}`,
    '/instructor/builder',
  ]) {
    await noHorizontalScroll(page, path);
  }
  expect(problems).toEqual([]);
});

test('admin pages: accessible and responsive', async ({ page }, info) => {
  const problems = watchConsole(page);
  await logIn(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/admin$/);
  await visit(page, '/admin', 'admin-publish', info);
  await visit(page, '/admin/users', 'admin-users', info);
  await visit(page, '/admin/sandboxes', 'admin-sandboxes', info);
  await page.setViewportSize({ width: 768, height: 1024 });
  for (const path of ['/admin', '/admin/users', '/admin/sandboxes']) await noHorizontalScroll(page, path);
  expect(problems).toEqual([]);
});

/** Tab until the focused element matches, asserting every stop shows a visible focus indicator. */
async function tabTo(page: Page, matches: (text: string, tag: string) => boolean, max = 60) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      return {
        text: (el.getAttribute('aria-label') ?? el.innerText ?? el.getAttribute('name') ?? '').trim(),
        tag: el.tagName.toLowerCase(),
        visible: s.outlineStyle !== 'none' || (s.boxShadow !== 'none' && s.boxShadow !== ''),
      };
    });
    if (!f) continue;
    expect.soft(f.visible, `visible focus indicator on <${f.tag}> "${f.text.slice(0, 40)}"`).toBe(true);
    if (matches(f.text, f.tag)) return;
  }
  throw new Error('never reached the wanted element by keyboard');
}

test('keyboard only: log in, reach the catalogue, open a brief; dialogs trap and return focus', async ({
  page,
  baseURL,
}) => {
  const email = uniqueEmail('kbd');
  const api = await page.context().request;
  // An existing, onboarded account (so no tour gets in the way), then signed out.
  await api.post('/api/auth/register', {
    data: { name: 'Keyboard User', email, password: 'correct-horse-battery' },
  });
  await api.post('/api/auth/me/onboarded');
  await page.context().clearCookies();
  expect(baseURL).toBeTruthy();

  await page.goto('/');
  await tabTo(page, (t, tag) => tag === 'a' && /^Log in$/i.test(t));
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/login/);
  await tabTo(page, (_t, tag) => tag === 'input');
  await page.keyboard.type(email);
  await page.keyboard.press('Tab');
  await page.keyboard.type('correct-horse-battery');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/dashboard$/);

  await tabTo(page, (t, tag) => tag === 'a' && t === 'Scenarios');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Scenario Catalogue' })).toBeVisible();
  await tabTo(page, (t, tag) => tag === 'a' && t.includes('The Rs 1,000 Discount Bug'));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'The Rs 1,000 Discount Bug' })).toBeVisible();

  // Dialogs: focus moves in, Tab stays inside, Escape closes and focus returns to the trigger.
  await page.context().clearCookies();
  await signUp(page, { name: 'Keyboard Teacher', email: uniqueEmail('kbdt'), role: 'Instructor' });
  await expect(page).toHaveURL(/\/instructor$/);
  const trigger = page.getByRole('button', { name: '+ New class' }).first();
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Create a class' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Class name')).toBeFocused();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('workspace and debrief: accessible, fast (needs Docker)', async ({ page }, info) => {
  test.skip(process.env.SANDBOX_TESTS !== '1', 'set SANDBOX_TESTS=1 (Docker + scenario images required)');
  const problems = watchConsole(page);
  await signUp(page, { name: 'Quality Player', email: uniqueEmail('qaw') });
  await page.getByRole('button', { name: 'Skip tour' }).click();
  await page.goto('/scenarios/discount-bug');
  await page.getByRole('button', { name: '▶ Start attempt' }).click();
  await expect(page).toHaveURL(/\/attempts\/\w+$/, { timeout: 45_000 });
  const id = page.url().split('/').pop()!;
  await expect(page.locator('.cm-content')).toBeVisible();

  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('.cm-content')).toBeVisible();
  const ms = await lcpOf(page);
  summary.push({ page: 'workspace (LCP)', violations: {}, lcpMs: Math.round(ms) });
  expect.soft(ms, 'LCP of workspace').toBeLessThan(LCP_BUDGET_MS);
  await expectAccessible(page, 'workspace-3d', info);
  await page.getByRole('group', { name: 'Map view' }).getByRole('button', { name: '2D' }).click();
  await expectAccessible(page, 'workspace-2d', info);

  // NFR-05: frames per second with the 3D map open (informational unless QUALITY_STRICT=1:
  // headless Chrome renders WebGL in software).
  await page.getByRole('group', { name: 'Map view' }).getByRole('button', { name: '3D' }).click();
  const fps = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = () => {
          frames++;
          if (performance.now() - start < 3000) requestAnimationFrame(tick);
          else resolve((frames * 1000) / (performance.now() - start));
        };
        requestAnimationFrame(tick);
      }),
  );
  summary.push({ page: `workspace 3D map (${Math.round(fps)} fps)`, violations: {} });
  if (process.env.QUALITY_STRICT === '1') expect(fps).toBeGreaterThanOrEqual(30);

  // Finish quickly through the API: fix, prevent the incident, ship, finish.
  const edit = async (path: string, change: (s: string) => string) => {
    const cur = (
      await (await page.request.get(`/api/attempts/${id}/file?path=${encodeURIComponent(path)}`)).json()
    ).content as string;
    await page.request.put(`/api/attempts/${id}/files`, { data: { path, content: change(cur) } });
  };
  await edit('src/discount.js', (s) =>
    s.replace('order.total > DISCOUNT_THRESHOLD', 'order.total >= DISCOUNT_THRESHOLD'),
  );
  await edit('deploy/payments.env', (s) => s.replace(/^PAYMENT_TIMEOUT_MS=\d+$/m, 'PAYMENT_TIMEOUT_MS=5000'));
  await page.request.post(`/api/attempts/${id}/deploy`, { data: { message: 'fix', strategy: 'canary' } });
  await expect
    .poll(async () => (await (await page.request.get(`/api/attempts/${id}`)).json()).engine.canFinish, {
      timeout: 60_000,
    })
    .toBe(true);
  expect((await page.request.post(`/api/attempts/${id}/finish`)).status()).toBe(200);

  await visit(page, `/attempts/${id}/debrief`, 'debrief', info, { lcp: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await noHorizontalScroll(page, `/attempts/${id}/debrief`);
  expect(problems).toEqual([]);
});
