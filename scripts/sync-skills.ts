// sync-skills.ts — mirror canonical skills/ → committed .claude/skills/ (where Claude Code auto-loads). Re-run after editing a skill.
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
