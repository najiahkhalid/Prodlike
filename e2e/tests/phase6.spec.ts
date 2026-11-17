import { expect, test } from '@playwright/test';
import { signUp, uniqueEmail } from './helpers';

/**
 * Phase 6 content: every new scenario can be found, briefed and started in a real sandbox, with its
 * own code, its release-train history and no unrendered {{placeholders}}. Each scenario's full
 * playthrough (fix → deploy → incident → recover → score) is covered by apps/api/test/scenarios.int.spec.ts.
 */
test.skip(process.env.SANDBOX_TESTS !== '1', 'set SANDBOX_TESTS=1 (Docker + scenario images required)');
test.setTimeout(150_000);

const NEW_SCENARIOS = [
  {
    slug: 'free-delivery',
    title: 'Free Delivery Over Rs 1,500',
    ticket: 'KTB-219',
    entry: /^delivery\.js/,
    code: 'return STANDARD_FEE;',
    commit: 'perf(cache): shorten catalogue cache',
  },
  {
    slug: 'missing-env-var',
    title: 'The Missing Env Variable',
    ticket: 'PD-1107',
    entry: /^phone\.js/,
    code: 'function normalisePhone(raw)',
    commit: 'ops: rotate SMS gateway secrets',
  },
  {
    slug: 'friday-deploy',
    title: 'Friday Deploy Gone Wrong',
    ticket: 'RM-3304',
    entry: /^fare\.js/,
    code: '* trip.surge',
    commit: 'db: add index for my-trips (migration 042)',
  },
];

test('the four scenarios are in the catalogue', async ({ page }) => {
  await signUp(page, { name: 'Catalogue Check', email: uniqueEmail('cat') });
  await page.getByRole('button', { name: 'Skip tour' }).click();
  await page.goto('/scenarios');
  for (const title of ['The Rs 1,000 Discount Bug', ...NEW_SCENARIOS.map((s) => s.title)]) {
    await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible();
  }
});

for (const s of NEW_SCENARIOS) {
  test(`${s.slug}: brief → start → code, history and terminal work`, async ({ page }) => {
    await signUp(page, { name: 'Scenario Player', email: uniqueEmail(s.slug) });
    await page.getByRole('button', { name: 'Skip tour' }).click();

    await page.goto(`/scenarios/${s.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: s.title })).toBeVisible();
    await expect(page.getByText(s.ticket)).toBeVisible();
    await expect(page.getByText('{{')).toHaveCount(0);

    await page.getByRole('button', { name: '▶ Start attempt' }).click();
    await expect(page).toHaveURL(/\/attempts\/\w+$/, { timeout: 45_000 });
    await expect(
      page.getByRole('navigation', { name: 'Explorer' }).getByRole('button', { name: s.entry }).first(),
    ).toBeVisible();
    await expect(page.locator('.cm-content')).toContainText(s.code);

    await page.getByRole('tab', { name: 'Terminal' }).click();
    const input = page.getByLabel('learner@sandbox:~$');
    await input.fill('git log --oneline');
    await input.press('Enter');
    await expect(page.getByRole('log')).toContainText(s.commit, { timeout: 20_000 });
    await input.fill('git diff');
    await input.press('Enter');
    await expect(page.getByRole('log')).not.toContainText('{{');

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'End attempt' }).click();
    await expect(page).toHaveURL(new RegExp(`/scenarios/${s.slug}$`));
  });
}
