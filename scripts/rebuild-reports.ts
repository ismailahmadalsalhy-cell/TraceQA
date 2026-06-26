import type { Reporter } from '@playwright/test/reporter';
import { execSync } from 'node:child_process';

// Regenerates both reports after each run. LAST in the reporter array so it runs
// after the JSON reporter writes results.json (a globalTeardown fires too early).
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
