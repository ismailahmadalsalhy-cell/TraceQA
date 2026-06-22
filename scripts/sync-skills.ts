/**
 * sync-skills.ts — copy canonical skills/ → .claude/skills/.
 *
 * skills/ is the SOURCE OF TRUTH (human-authored, reviewed, committed).
 * .claude/skills/ is the location Claude Code auto-loads project skills from
 * (confirmed: .claude/skills/<name>/SKILL.md). We keep a committed mirror there
 * so native auto-loading works on a fresh clone.
 *
 * Re-run after editing any skills/**\/SKILL.md:  npm run sync:skills
 * Deterministic. No AI.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const SRC = path.join(process.cwd(), 'skills');
const DEST = path.join(process.cwd(), '.claude', 'skills');

async function copyDir(src: string, dest: string): Promise<number> {
  await fs.mkdir(dest, { recursive: true });
  let files = 0;
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) files += await copyDir(s, d);
    else {
      await fs.copyFile(s, d);
      files++;
    }
  }
  return files;
}

async function main(): Promise<void> {
  await fs.rm(DEST, { recursive: true, force: true });
  const n = await copyDir(SRC, DEST);
  console.log(`✓ Synced skills/ → .claude/skills/ (${n} file(s)).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
