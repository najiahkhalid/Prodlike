import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { uniqueEmail } from './helpers';

// Needs Docker + the discount-bug sandbox image (pnpm scenarios:build).
test.skip(process.env.SANDBOX_TESTS !== '1', 'set SANDBOX_TESTS=1 (Docker + scenario images required)');
test.setTimeout(180_000);

const TEMPLATE = join(__dirname, '..', '..', 'scenarios', 'discount-bug', 'template', 'src', 'discount.js');
const FIXED = readFileSync(TEMPLATE, 'utf8').replace(
  'order.total > DISCOUNT_THRESHOLD',
  'order.total >= DISCOUNT_THRESHOLD',
);

test('guest demo → hint → canary deploy → rollback → debrief → sign up keeps it (Phase 4 exit)', async ({
  page,
}) => {
  // One click from the landing page, no account (A2 refinement 1).
  await page.goto('/');
  await page.getByRole('link', { name: /Try a 5-minute demo/ }).click();
  await expect(page).toHaveURL(/\/attempts\/\w+$/, { timeout: 45_000 });
  await expect(page.getByText('Guest demo')).toBeVisible();

  // Guests cannot wander into member pages.
  const url = page.url();
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/signup\?claim=1/);
  await page.goto(url);

  // A hint costs points (A2 refinement 3).
  await page.getByRole('button', { name: /^Hint/ }).click();
  const hints = page.getByRole('dialog', { name: 'Hints' });
  await expect(hints).toContainText('costs 5 points');
  await hints.getByRole('button', { name: 'Reveal a hint (−5)' }).click();
  await expect(hints.getByRole('list', { name: 'Hints you have used' })).toContainText('src/discount.js');
  await hints.getByRole('button', { name: 'Close' }).click();

  // Fix, then ship as a canary.
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText(FIXED);
  await expect(page.getByText('✓ Saved')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '⇪ Commit & Deploy' }).click();
  const dialog = page.getByRole('dialog', { name: 'Commit & deploy to production' });
  await dialog.getByLabel('Commit message').fill('fix: include orders of exactly Rs 1000');
  await dialog.getByRole('radio', { name: /Canary/ }).check();
  await dialog.getByRole('button', { name: 'Run pipeline' }).click();

  // The canary limits the incident to 10% of traffic; roll back.
  const alert = page.getByRole('alert').filter({ hasText: 'payments-service' });
  await expect(alert).toBeVisible({ timeout: 60_000 });
  await expect(alert).toContainText('10% (canary)');
  await page.getByRole('button', { name: /Roll back to v1\.4\.1/ }).click();
  await expect(page.getByRole('button', { name: '✓ Finish attempt' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: '✓ Finish attempt' }).click();

  // The debrief (FR-15): score, rubric, timeline, tips, badges, and the invitation to keep it.
  await expect(page).toHaveURL(/\/debrief$/, { timeout: 45_000 });
  await expect(page.getByRole('heading', { name: 'Debrief: The Rs 1,000 Discount Bug' })).toBeVisible();
  const score = Number(await page.getByTestId('score').textContent());
  expect(score).toBeGreaterThan(40);
  await expect(page.locator('[data-rubric="fix-correct"]')).toContainText('30/30');
  await expect(page.locator('[data-rubric="safe-deploy"]')).toContainText('20/20');
  await expect(page.getByText(/Hints used/)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Attempt timeline' })).toContainText('canary');
  await expect(page.getByText('Canary Keeper')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nice work! Save this result?' })).toBeVisible();

  // Signing up keeps the demo result.
  await page.getByRole('link', { name: 'Create free account' }).click();
  await expect(page).toHaveURL(/\/signup\?claim=1/);
  await expect(page.getByText('Your demo attempt and its debrief will be saved')).toBeVisible();
  await page.getByLabel('Full name').fill('Ali Raza');
  await page.getByLabel('Email').fill(uniqueEmail('claimed'));
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Skip tour' }).click();
  await expect(page.getByTestId('completed')).toHaveText('1');

  // Progress history (FR-16).
  await page.getByRole('navigation').getByRole('link', { name: 'Progress History' }).click();
  await expect(page.getByRole('heading', { name: 'Progress History' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Score trend/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /The Rs 1,000 Discount Bug/ })).toContainText(String(score));
  await page.getByRole('link', { name: 'Debrief' }).first().click();
  await expect(page.getByTestId('score')).toHaveText(String(score));
});
