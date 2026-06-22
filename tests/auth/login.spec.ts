import { test, expect } from '@playwright/test';

/**
 * Seed test for FR-AUTH-001 — user login.
 *
 * Authored by AI (test-authoring skill); RUN by plain Playwright with no AI in
 * the loop. Selectors come from steps/login.json and follow the selector ladder:
 *   data-testid  →  accessible (role + name / label)  →  structural / CSS (flagged)
 *
 * Tagging — two independent axes so `--grep` can rerun by either:
 *   requirement axis : @FR-AUTH-001
 *   suite axis       : @smoke, @sprint10
 */
test(
  'user logs in with valid credentials and lands on the dashboard',
  { tag: ['@FR-AUTH-001', '@smoke', '@sprint10'] },
  async ({ page }) => {
    await page.goto('/login.html');

    // Rung 1 — data-testid (high confidence).
    await page.getByTestId('login-email').fill('test@example.com');
    await page.getByTestId('login-password').fill('Passw0rd!');

    // Rung 2 — accessible: role + visible name.
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Web-first assertion (auto-waits) — Then: dashboard shows the user's name.
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
    // Still on the login page — the form is present, no dashboard greeting.
    await expect(page.getByTestId('login-submit')).toBeVisible();
  },
);
