import { test, expect } from '@playwright/test';

// Seed test for FR-AUTH-001. AI-authored, plain-Playwright-run; selectors per the
// ladder. Two tag axes: requirement (@FR-AUTH-001) + suite (@smoke, @sprint10).
test(
  'user logs in with valid credentials and lands on the dashboard',
  { tag: ['@FR-AUTH-001', '@smoke', '@sprint10'] },
  async ({ page }) => {
    await page.goto('/login.html');

    await page.getByTestId('login-email').fill('test@example.com');
    await page.getByTestId('login-password').fill('Passw0rd!');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByTestId('dashboard-greeting')).toContainText('Test User');
  },
);

test(
  'user sees an error when the password is wrong and stays on the login page',
  { tag: ['@FR-AUTH-001', '@smoke', '@sprint10'] },
  async ({ page }) => {
    await page.goto('/login.html');

    await page.getByTestId('login-email').fill('test@example.com');
    await page.getByTestId('login-password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByTestId('login-error')).toHaveText('Invalid email or password.');
    // still on login — form present, no dashboard
    await expect(page.getByTestId('login-submit')).toBeVisible();
  },
);
