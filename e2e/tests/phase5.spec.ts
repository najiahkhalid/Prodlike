import { expect, test, type Page } from '@playwright/test';
import { ADMIN, finishTour, logIn, signUp, uniqueEmail } from './helpers';

/**
 * Phase 5 exit: an instructor creates a class, a learner joins by code at sign-up, a scenario is
 * assigned with a deadline, results and the CSV export appear, and another instructor sees nothing.
 * No Docker needed: the learner does not start a sandbox here (the API test covers scoring).
 */
test.setTimeout(90_000);

async function newPage(
  browser: import('@playwright/test').Browser,
  baseURL: string | undefined,
): Promise<Page> {
  const ctx = await browser.newContext({ baseURL });
  return ctx.newPage();
}

test('instructor class → learner joins by code → assignment → results + CSV; isolation (Phase 5 exit)', async ({
  page,
  browser,
  baseURL,
}) => {
  page.on('dialog', (d) => d.accept());

  // Instructor creates a class.
  await signUp(page, { name: 'Dr Sara Malik', email: uniqueEmail('teacher'), role: 'Instructor' });
  await expect(page).toHaveURL(/\/instructor$/);
  await page.getByRole('button', { name: '+ New class' }).first().click();
  await page.getByLabel('Class name').fill('BSCS-12 Lab');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('tab', { name: 'BSCS-12 Lab' })).toHaveAttribute('aria-selected', 'true');
  const code = ((await page.getByTestId('join-code').textContent()) ?? '').slice(0, 9);
  expect(code).toMatch(/^[A-Z]{4}-\d{4}$/);

  // Assign the discount bug with a deadline next week.
  await page.getByRole('button', { name: 'Assign scenario' }).click();
  const dialog = page.getByRole('dialog', { name: 'Assign a scenario' });
  await dialog.getByLabel('Scenario').selectOption('discount-bug');
  const due = new Date(Date.now() + 7 * 86_400_000);
  const local = new Date(due.getTime() - due.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await dialog.getByLabel(/Deadline/).fill(local);
  await dialog.getByRole('button', { name: 'Assign' }).click();
  await expect(page.getByRole('table', { name: 'Assignments' })).toContainText('The Rs 1,000 Discount Bug');

  // A learner signs up with the class code and sees the assignment.
  const learnerEmail = uniqueEmail('ali');
  const learner = await newPage(browser, baseURL);
  await learner.goto('/signup');
  await learner.getByLabel('Full name').fill('Ali Raza');
  await learner.getByLabel('Email').fill(learnerEmail);
  await learner.getByLabel('Password').fill('correct-horse-battery');
  await learner.getByLabel(/Class join code/).fill(code.toLowerCase());
  await learner.getByRole('button', { name: 'Create account' }).click();
  await expect(learner).toHaveURL(/\/dashboard$/);
  await finishTour(learner);
  await expect(learner.getByTestId('my-classes')).toContainText('BSCS-12 Lab');
  const assigned = learner.getByRole('table', { name: 'Assignments' });
  await expect(assigned).toContainText('The Rs 1,000 Discount Bug');
  await expect(assigned).toContainText('To do');

  // A wrong code explains itself.
  await learner.getByLabel('Class join code').fill('ZZZZ-0000');
  await learner.getByRole('button', { name: 'Join' }).click();
  await expect(learner.getByRole('alert').filter({ hasText: 'No class uses that join code.' })).toBeVisible();

  // Learners cannot read instructor data.
  expect((await learner.request.get('/api/instructor/cohorts')).status()).toBe(403);

  // The instructor sees the learner in the results, and the CSV export.
  await page.reload();
  await expect(page.getByTestId('learner-count')).toHaveText('1');
  await page.getByRole('link', { name: 'Results' }).first().click();
  await expect(page).toHaveURL(/\/instructor\/assignments\/\w+$/);
  await expect(page.getByRole('heading', { level: 1, name: 'The Rs 1,000 Discount Bug' })).toBeVisible();
  await expect(page.getByTestId('completed-count')).toHaveText('0 / 1');
  const results = page.getByRole('table', { name: 'Learner results' });
  await expect(results).toContainText('Ali Raza');
  await expect(results).toContainText('Not done');

  const assignmentId = page.url().split('/').pop()!;
  const csv = await page.request.get(`/api/instructor/assignments/${assignmentId}/results.csv`);
  expect(csv.headers()['content-type']).toContain('text/csv');
  expect(csv.headers()['content-disposition']).toMatch(/attachment; filename=".+\.csv"/);
  const text = (await csv.text()).replace(/^\uFEFF/, '');
  expect(text.split('\r\n')[0]).toContain('learner');
  expect(text).toContain(learnerEmail);

  // Another instructor cannot see this class or its results (NFR-13).
  const other = await newPage(browser, baseURL);
  await signUp(other, { name: 'Dr Other', email: uniqueEmail('other'), role: 'Instructor' });
  await expect(other).toHaveURL(/\/instructor$/);
  await expect(other.getByRole('heading', { name: 'Create your first class' })).toBeVisible();
  expect((await other.request.get(`/api/instructor/assignments/${assignmentId}/results`)).status()).toBe(404);
  await other.goto(`/instructor/assignments/${assignmentId}`);
  await expect(other.getByText(/could not be found|not found/i).first()).toBeVisible();

  // Manage class: remove the learner.
  await page.getByRole('navigation').getByRole('link', { name: 'Classes' }).click();
  const members = page.getByRole('table', { name: 'Members of BSCS-12 Lab' });
  await expect(members).toContainText('Ali Raza');
  await members.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Nobody has joined yet.')).toBeVisible();
});

test('scenario builder: an instructor saves a variant and can assign it (FR-19)', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await signUp(page, { name: 'Dr Builder', email: uniqueEmail('builder'), role: 'Instructor' });
  await expect(page).toHaveURL(/\/instructor$/);
  await page.getByRole('navigation').getByRole('link', { name: 'Scenario Builder' }).click();

  await page.getByLabel('Variant title').fill('Discount Bug: code only');
  await page.getByLabel(/Inject the production incident/).uncheck();
  // Weights must add up to 100 before saving.
  const first = page.getByLabel(/^Weight for/).first();
  const original = await first.inputValue();
  await first.fill(String(Number(original) + 5));
  await expect(page.getByRole('button', { name: 'Save variant' })).toBeDisabled();
  await first.fill(original);
  await expect(page.getByTestId('weight-total')).toHaveText('(100/100)');
  await page.getByRole('button', { name: 'Save variant' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'saved' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Discount Bug: code only' })).toBeVisible();

  // It is offered when assigning, marked as the instructor's own variant.
  await page.getByRole('navigation').getByRole('link', { name: 'Instructor Dashboard' }).click();
  await page.getByRole('button', { name: '+ New class' }).first().click();
  await page.getByLabel('Class name').fill('Variant Lab');
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('button', { name: 'Assign scenario' }).click();
  await expect(page.getByRole('dialog').getByLabel('Scenario')).toContainText(
    'Discount Bug: code only (your variant)',
  );
});

test('admin: change a role and see sandbox health (FR-20)', async ({ page, browser, baseURL }) => {
  const email = uniqueEmail('promote');
  const learner = await newPage(browser, baseURL);
  await signUp(learner, { name: 'Promote Me', email });
  await expect(learner).toHaveURL(/\/dashboard$/);

  page.on('dialog', (d) => d.accept());
  await logIn(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('navigation').getByRole('link', { name: 'Users & Roles' }).click();
  await page.getByLabel('Search users').fill(email);
  await page.getByRole('button', { name: 'Search' }).click();
  const role = page.getByLabel('Role for Promote Me');
  await expect(role).toHaveValue('LEARNER');
  await role.selectOption('INSTRUCTOR');
  await expect(role).toHaveValue('INSTRUCTOR');

  // Their refresh sessions were revoked; on the next login they land as an instructor.
  await learner.context().clearCookies();
  await logIn(learner, email, 'correct-horse-battery');
  await expect(learner).toHaveURL(/\/instructor$/);

  await page.getByRole('navigation').getByRole('link', { name: 'Sandbox Health' }).click();
  await expect(page.getByRole('heading', { name: 'Sandbox health' })).toBeVisible();
  await expect(page.getByTestId('docker-status')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Scenario images' })).toContainText('discount-bug');
});
