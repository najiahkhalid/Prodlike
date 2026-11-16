import { expect, test } from '@playwright/test';
import { ADMIN, finishTour, logIn, signUp, uniqueEmail } from './helpers';

test('learner golden path: sign up → tour → catalogue filter → brief → log out (Phase 1 exit)', async ({
  page,
}) => {
  await signUp(page, { name: 'Ali Raza', email: uniqueEmail('ali') });

  await expect(page).toHaveURL(/\/dashboard$/);
  await finishTour(page);
  await expect(page.getByRole('heading', { name: 'Welcome, Ali' })).toBeVisible();

  // The tour does not come back after a reload (onboarding saved on the server).
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('navigation').getByRole('link', { name: 'Scenarios' }).click();
  await expect(page.getByRole('heading', { name: 'Scenario Catalogue' })).toBeVisible();

  // Filters live in the URL.
  await page.getByRole('link', { name: 'Advanced' }).click();
  await expect(page).toHaveURL(/difficulty=advanced/);
  await expect(page.getByText('No scenarios match these filters.')).toBeVisible();
  await page.getByRole('link', { name: 'Clear filters' }).click();
  await page.getByRole('link', { name: 'Testing', exact: true }).click();
  await expect(page).toHaveURL(/skill=Testing/);

  await page.getByRole('link', { name: /The Rs 1,000 Discount Bug/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'The Rs 1,000 Discount Bug' })).toBeVisible();
  await expect(page.getByText('BYTE-482')).toBeVisible();
  await expect(page.getByRole('heading', { name: "How you'll be scored" })).toBeVisible();
  // The brief must not leak the incident it is about to inject.
  await expect(page.getByText(/PAYMENT_TIMEOUT_MS=50/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login\?loggedOut=1/);
  await expect(page.getByText('You have been logged out.')).toBeVisible();

  // Protected pages now bounce to login, remembering where we wanted to go.
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
});

test('a learner cannot reach the instructor area (FR-02)', async ({ page }) => {
  await signUp(page, { name: 'Sara Learner', email: uniqueEmail('sara') });
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto('/instructor');
  await expect(page).toHaveURL(/\/dashboard\?denied=%2Finstructor/);
  await expect(page.getByRole('alert').filter({ hasText: 'does not have access' })).toBeVisible();

  // The API refuses too, even if the page were reached some other way.
  const res = await page.request.get('/api/instructor/overview');
  expect(res.status()).toBe(403);
  expect((await res.json()).code).toBe('FORBIDDEN');
});

test('instructors land on the instructor dashboard', async ({ page }) => {
  await signUp(page, { name: 'Dr Sara Malik', email: uniqueEmail('teacher'), role: 'Instructor' });
  await expect(page).toHaveURL(/\/instructor$/);
  await expect(page.getByRole('heading', { name: 'Instructor Dashboard' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Create your first class' })).toBeVisible();
});

test('login shows helpful errors (NFR-09) and logged-in users skip the login page', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Enter a valid email address')).toBeVisible();

  await logIn(page, 'nobody@e2e.test', 'wrong-password');
  await expect(page.getByRole('alert').filter({ hasText: 'Email or password is incorrect.' })).toBeVisible();

  const email = uniqueEmail('dup');
  await signUp(page, { name: 'Dup User', email });
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/login');
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('sign-up validates fields before sending', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('A');
  await page.getByLabel('Email').fill('not-an-email');
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Enter your full name')).toBeVisible();
  await expect(page.getByText('Use at least 10 characters')).toBeVisible();
  await expect(page.getByLabel('Full name')).toBeFocused();
});

test('forgot password always confirms without revealing accounts', async ({ page }) => {
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill('someone@e2e.test');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('Check your email.')).toBeVisible();
});

test('admin can unpublish and republish a scenario (FR-20)', async ({ page }) => {
  await logIn(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/admin$/);
  // Exact slug: instructors' Builder variants (discount-bug-v-…) are listed here too.
  const row = page.getByRole('row').filter({ has: page.getByText('discount-bug', { exact: true }) });
  await row.getByRole('button', { name: 'Unpublish', exact: true }).click();
  await expect(row.getByText('Draft')).toBeVisible();
  await row.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(row.getByText('✓ Published')).toBeVisible();
});
