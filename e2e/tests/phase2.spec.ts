import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { signUp, uniqueEmail } from './helpers';

// Needs Docker + the discount-bug sandbox image (pnpm scenarios:build).
test.skip(process.env.SANDBOX_TESTS !== '1', 'set SANDBOX_TESTS=1 (Docker + scenario images required)');
test.setTimeout(120_000);

const TEMPLATE = join(__dirname, '..', '..', 'scenarios', 'discount-bug', 'template', 'src', 'discount.js');
const FIXED = readFileSync(TEMPLATE, 'utf8').replace(
  'order.total > DISCOUNT_THRESHOLD',
  'order.total >= DISCOUNT_THRESHOLD',
);

test('workspace: start → run tests → edit → terminal → resume after refresh → end (Phase 2 exit)', async ({
  page,
}) => {
  await signUp(page, { name: 'Ali Raza', email: uniqueEmail('ws') });
  await page.getByRole('button', { name: 'Skip tour' }).click();

  await page.goto('/scenarios/discount-bug');
  await page.getByRole('button', { name: '▶ Start attempt' }).click();
  await expect(page).toHaveURL(/\/attempts\/\w+$/, { timeout: 30_000 });
  const url = page.url();

  // Workspace loaded with the scenario's entry file.
  await expect(
    page
      .getByRole('navigation', { name: 'Explorer' })
      .getByRole('button', { name: /^discount\.js/ })
      .first(),
  ).toBeVisible();
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('order.total > DISCOUNT_THRESHOLD');
  await expect(page.getByText(/Sandbox ready in/)).toBeVisible();

  // Real tests run in the sandbox (FR-07).
  await page.getByRole('button', { name: '▶ Run tests' }).click();
  await expect(page.getByRole('status').filter({ hasText: '2 passed' })).toBeVisible({ timeout: 40_000 });

  // Edit the file; autosave writes it into the sandbox.
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText(FIXED);
  await expect(page.getByText('✓ Saved')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTitle('Modified').first()).toBeVisible();

  // Restricted terminal (FR-06).
  await page.getByRole('tab', { name: 'Terminal' }).click();
  const input = page.getByLabel('learner@sandbox:~$');
  await input.fill('git diff');
  await input.press('Enter');
  await expect(page.getByRole('log')).toContainText('>= DISCOUNT_THRESHOLD', { timeout: 20_000 });
  await input.fill('rm -rf /');
  await input.press('Enter');
  await expect(page.getByRole('log')).toContainText('not permitted');

  // Refresh resumes the same attempt with the saved change (NFR-14).
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.locator('.cm-content')).toContainText('order.total >= DISCOUNT_THRESHOLD', {
    timeout: 20_000,
  });

  // Ending removes the sandbox and returns to the brief.
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'End attempt' }).click();
  await expect(page).toHaveURL(/\/scenarios\/discount-bug$/);
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'This attempt has ended' })).toBeVisible();
});

test('workspace pages are private to their owner', async ({ page, browser, baseURL }) => {
  await signUp(page, { name: 'Owner', email: uniqueEmail('owner') });
  await page.getByRole('button', { name: 'Skip tour' }).click();
  await page.goto('/scenarios/discount-bug');
  await page.getByRole('button', { name: '▶ Start attempt' }).click();
  await expect(page).toHaveURL(/\/attempts\/\w+$/, { timeout: 30_000 });
  const url = page.url();

  const otherContext = await browser.newContext({ baseURL });
  const other = await otherContext.newPage();
  await signUp(other, { name: 'Someone Else', email: uniqueEmail('other') });
  await expect(other).toHaveURL(/\/dashboard$/);
  await other.goto(url);
  await expect(other.getByRole('heading', { name: 'Attempt not found' })).toBeVisible();
  await otherContext.close();

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'End attempt' }).click();
});
