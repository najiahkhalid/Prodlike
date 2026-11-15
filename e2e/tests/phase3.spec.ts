import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { signUp, uniqueEmail } from './helpers';

// Needs Docker + the discount-bug sandbox image (pnpm scenarios:build).
test.skip(process.env.SANDBOX_TESTS !== '1', 'set SANDBOX_TESTS=1 (Docker + scenario images required)');
test.setTimeout(180_000);

const TEMPLATE = join(__dirname, '..', '..', 'scenarios', 'discount-bug', 'template', 'src', 'discount.js');
const FIXED = readFileSync(TEMPLATE, 'utf8').replace(
  'order.total > DISCOUNT_THRESHOLD',
  'order.total >= DISCOUNT_THRESHOLD',
);

test('engine: fix → deploy → incident → logs → rollback → finish (Phase 3 exit)', async ({ page }) => {
  await signUp(page, { name: 'Ali Raza', email: uniqueEmail('engine') });
  await page.getByRole('button', { name: 'Skip tour' }).click();
  await page.goto('/scenarios/discount-bug');
  await page.getByRole('button', { name: '▶ Start attempt' }).click();
  await expect(page).toHaveURL(/\/attempts\/\w+$/, { timeout: 30_000 });

  // Live channel connects and the 3D map renders (WebGL in headless Chrome).
  await expect(page.getByLabel('Live updates connected')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('canvas').first()).toBeVisible();
  await expect(page.getByTestId('release')).toHaveText('v1.4.1');

  // Fix the bug.
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText(FIXED);
  await expect(page.getByText('✓ Saved')).toBeVisible({ timeout: 15_000 });

  // Commit & deploy directly (FR-08, FR-09).
  await page.getByRole('button', { name: '⇪ Commit & Deploy' }).click();
  const dialog = page.getByRole('dialog', { name: 'Commit & deploy to production' });
  await dialog.getByLabel('Commit message').fill('fix(discount): include orders of exactly Rs 1000');
  await dialog.getByRole('radio', { name: /Direct/ }).check();
  await dialog.getByRole('button', { name: 'Run pipeline' }).click();

  // The pipeline runs live; every stage passes.
  await expect(page.getByRole('tab', { name: 'Pipeline' })).toHaveAttribute('aria-selected', 'true');
  for (const stage of ['build', 'lint', 'test', 'deploy']) {
    await expect(page.locator(`[data-stage="${stage}"]`)).toHaveAttribute('data-status', 'passed', {
      timeout: 60_000,
    });
  }

  // Then the incident fires (FR-10) and the Incidents tab opens itself.
  const alert = page.getByRole('alert').filter({ hasText: 'payments-service returning 5xx' });
  await expect(alert).toBeVisible({ timeout: 30_000 });
  await expect(alert).toContainText('SEV-2');
  await expect(alert).toContainText('all traffic');

  // The map shows payments down (2D view: state as icon + label, not colour alone).
  await page.getByRole('tab', { name: 'System Map' }).click();
  await page.getByRole('button', { name: '2D' }).click();
  await expect(page.locator('[data-node="payments"]')).toHaveAttribute('data-state', 'down');
  await expect(page.locator('[data-node="payments"]')).toContainText('✕ down');
  await expect(page.getByTestId('release')).toHaveText('v1.4.2');

  // Investigate, then roll back (FR-11).
  await page.getByRole('tab', { name: 'Incidents' }).click();
  await alert.getByRole('button', { name: 'View logs' }).click();
  await expect(page.getByRole('log')).toContainText('ETIMEDOUT after 50ms', { timeout: 15_000 });
  await page.getByRole('tab', { name: 'Incidents' }).click();
  await page.getByRole('button', { name: /Roll back to v1\.4\.1/ }).click();
  await expect(page.getByRole('status').filter({ hasText: /Service restored in \d+s/ })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('release'))
    .toHaveText('v1.4.1')
    .catch(() => undefined);

  // Finish.
  await page.getByRole('button', { name: '✓ Finish attempt' }).click();
  await expect(page.getByRole('heading', { name: 'Scenario complete' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/by rolling back/)).toBeVisible();
});
