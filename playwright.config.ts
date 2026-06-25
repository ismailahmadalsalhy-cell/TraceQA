import { defineConfig, devices } from '@playwright/test';

/**
 * Plain Playwright. NO AI in the run loop — this config runs on every commit,
 * fast and free. AI is only ever spent at authoring / discovery / failure-analysis
 * time (see the four skills under skills/).
 *
 * Each invocation writes into its own timestamped folder under test-results/ so
 * run history is preserved and scripts/generate-report.ts can pick the latest.
 * The timestamp is computed once, when the config is loaded.
 */
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = `test-results/${stamp}`;

export default defineConfig({
  testDir: './tests',
  // Per-run artifacts (traces, screenshots, videos) live beside that run's report.
  outputDir: `${runDir}/artifacts`,

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,

  // HTML for humans, JSON for generate-report.ts. Both timestamped. The rebuild
  // reporter is LAST so it runs after the JSON file lands and can read this run.
  reporter: [
    ['list'],
    ['json', { outputFile: `${runDir}/results.json` }],
    ['html', { outputFolder: `${runDir}/html-report`, open: 'never' }],
    // After every run, regenerate reports/coverage.html + reports/dashboard.html.
    ['./scripts/rebuild-reports.ts'],
  ],

  use: {
    // Point this at your real app. Defaults to the bundled demo app in demo-app/
    // so `npm install && npm test` works offline, with zero setup.
    baseURL: process.env.BASE_URL ?? 'http://localhost:3100',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // The example target app. Replace with your own server (or remove and set
  // BASE_URL) when wiring this template to a real application.
  webServer: {
    command: 'node demo-app/server.mjs',
    url: 'http://localhost:3100/login.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
