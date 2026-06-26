import { defineConfig, devices } from '@playwright/test';

// Plain Playwright — no AI in the run loop. Each run writes its own timestamped test-results/ folder.
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = `test-results/${stamp}`;

export default defineConfig({
  testDir: './tests',
  outputDir: `${runDir}/artifacts`, // per-run traces, screenshots, videos

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,

  // json feeds the report generators; rebuild reporter is LAST so it runs after json writes.
  reporter: [
    ['list'],
    ['json', { outputFile: `${runDir}/results.json` }],
    ['html', { outputFolder: `${runDir}/html-report`, open: 'never' }],
    ['./scripts/rebuild-reports.ts'],
  ],

  use: {
    // defaults to the bundled demo app; point at your app with BASE_URL
    baseURL: process.env.BASE_URL ?? 'http://localhost:3100',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // example target app — replace/remove when pointing at your own
  webServer: {
    command: 'node demo-app/server.mjs',
    url: 'http://localhost:3100/login.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
