import { expect, test } from '@playwright/test';
import { finishTour, logIn, signUp, uniqueEmail } from './helpers';

test('profile & settings: edit the profile, change the password, log in with the new one', async ({
  page,
}) => {
  const email = uniqueEmail('settings');
  await signUp(page, { name: 'Settings Person', email });
  await finishTour(page);
  await page.getByRole('navigation').getByRole('link', { name: 'Profile & Settings' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Profile & Settings' })).toBeVisible();

  // Profile.
  await page.getByLabel('Full name').fill('S');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Enter your full name')).toBeVisible();
  await page.getByLabel('Full name').fill('Settings Person Renamed');
  await page.getByLabel(/University/).fill('NUST SEECS');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Profile saved' })).toBeVisible();
  await expect(page.getByRole('navigation')).toContainText('Settings Person Renamed');

  // Password: the wrong current password is explained next to the field.
  await page.getByLabel('Current password').fill('not-the-password');
  await page.getByLabel('New password').fill('a-brand-new-password');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('This is not your current password')).toBeVisible();
  await page.getByLabel('Current password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Password changed' })).toBeVisible();

  // Still signed in here; the new password works for the next login.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Profile & Settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Log out' }).click();
  await logIn(page, email, 'correct-horse-battery');
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
  await logIn(page, email, 'a-brand-new-password');
  await expect(page).toHaveURL(/\/dashboard$/);
});
