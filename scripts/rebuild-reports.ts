import type { Reporter } from '@playwright/test/reporter';
import { execSync } from 'node:child_process';

/**
 * rebuild-reports.ts — a Playwright reporter that regenerates the TraceQA views
 * after every run. DETERMINISTIC, no AI.
 *
 * Listed LAST in playwright.config.ts `reporter`: reporters' onEnd run in array
 * order, so by the time this fires the JSON reporter has already written
 * test-results/<run>/results.json — the generators then pick up this exact run.
 * (A globalTeardown can't do this — it runs before the JSON file is flushed.)
 */
export default class RebuildReports implements Reporter {
  onEnd(): void {
    for (const script of ['gen:report', 'gen:dashboard']) {
      try {
        execSync(`npm run ${script}`, { stdio: 'inherit' });
      } catch {
        console.error(`⚠ rebuild-reports: \`npm run ${script}\` failed (reports may be stale).`);
      }
    }
  }
}
