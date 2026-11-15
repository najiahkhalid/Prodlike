import { expect, type Page } from '@playwright/test';

/** Seeded by the CI / local setup (ADMIN_EMAIL / ADMIN_PASSWORD for the e2e database). */
export const ADMIN = { email: 'admin@e2e.test', password: 'admin-password-123' };

/** Unique per run, so the e2e database never needs resetting. */
export const uniqueEmail = (who: string) =>
  `${who}.${Date.now()}.${Math.floor(Math.random() * 1e4)}@e2e.test`;

export async function signUp(
  page: Page,
  opts: { name: string; email: string; role?: 'Learner' | 'Instructor' },
) {
  await page.goto('/signup');
  if (opts.role === 'Instructor') await page.getByRole('radio', { name: 'Instructor' }).click();
  await page.getByLabel('Full name').fill(opts.name);
  await page.getByLabel('Email').fill(opts.email);
  await page.getByLabel(/University/).fill('NUST SEECS');
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Create account' }).click();
}

export async function logIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

export async function finishTour(page: Page) {
  const tour = page.getByRole('dialog', { name: 'Welcome to Prodlike' });
  await expect(tour).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Start exploring' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
