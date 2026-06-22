/**
 * generate-index.ts — DETERMINISTIC. No AI. No LLM call anywhere in here.
 *
 * Scans every requirement file under requirements/, reads ONLY its YAML
 * frontmatter, and writes requirements/index.md as a metadata-only table.
 *
 * Why metadata-only: the index is the orientation layer. It is read FIRST to
 * decide which requirement files to load (selective loading is what saves
 * tokens), and it doubles as the dependency graph + the backbone of the
 * coverage report. Concatenating requirement bodies here would duplicate the
 * whole corpus, drift the instant one copy is edited, and reload everything on
 * every read. So: frontmatter only, never bodies.
 *
 * Idempotent: the same frontmatter in produces byte-identical index.md out.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const ROOT = process.cwd();
const REQUIREMENTS_DIR = path.join(ROOT, 'requirements');
const INDEX_PATH = path.join(REQUIREMENTS_DIR, 'index.md');

interface RequirementMeta {
  id: string;
  title: string;
  status: string;
  depends_on: string[];
  linked_tests: string[];
  path: string; // repo-relative, forward slashes
}

const toPosix = (p: string): string => p.split(path.sep).join('/');

const asArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : v === null || v === undefined || v === '' ? [] : [String(v)];

/** Escape a pipe so it can't break the Markdown table. */
const cell = (v: string): string => v.replace(/\|/g, '\\|');

/** Render a list cell: backticked, comma-joined, or an em dash when empty. */
const listCell = (xs: string[]): string => (xs.length ? xs.map((x) => `\`${cell(x)}\``).join(', ') : '—');

async function findRequirementFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await findRequirementFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'index.md') {
      out.push(full);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const files = await findRequirementFiles(REQUIREMENTS_DIR);
  const rows: RequirementMeta[] = [];
  const seen = new Map<string, string>();

  for (const file of files) {
    const relPath = toPosix(path.relative(ROOT, file));
    const { data } = matter(await fs.readFile(file, 'utf8'));

    const id = String(data.id ?? '').trim();
    if (!id) {
      console.warn(`⚠  ${relPath}: missing "id" in frontmatter — skipped.`);
      continue;
    }
    if (seen.has(id)) {
      console.warn(`⚠  duplicate id "${id}": ${relPath} also defined in ${seen.get(id)}.`);
    }
    seen.set(id, relPath);

    rows.push({
      id,
      title: String(data.title ?? '').trim(),
      status: String(data.status ?? 'documented').trim(),
      depends_on: asArray(data.depends_on),
      linked_tests: asArray(data.linked_tests),
      path: relPath,
    });
  }

  // Stable sort by id ⇒ idempotent output.
  rows.sort((a, b) => a.id.localeCompare(b.id));

  const lines = [
    '<!-- GENERATED FILE — DO NOT EDIT BY HAND. Regenerate with `npm run gen:index`. -->',
    '',
    '# Requirements Index',
    '',
    `_Metadata only — never requirement bodies. ${rows.length} requirement(s)._`,
    '',
    '| ID | Title | Status | Depends On | Linked Tests | Path |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map(
      (r) =>
        `| \`${r.id}\` | ${cell(r.title)} | ${r.status} | ${listCell(r.depends_on)} | ${listCell(r.linked_tests)} | \`${r.path}\` |`,
    ),
    '',
  ];

  await fs.writeFile(INDEX_PATH, lines.join('\n'), 'utf8');
  console.log(`✓ Wrote ${toPosix(path.relative(ROOT, INDEX_PATH))} — ${rows.length} requirement(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
