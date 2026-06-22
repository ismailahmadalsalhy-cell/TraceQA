/**
 * generate-report.ts — DETERMINISTIC. No AI. No LLM call anywhere in here.
 *
 * Reads requirements/index.md (metadata-only) + the latest timestamped
 * test-results/<run>/results.json (plain Playwright JSON), and writes
 * reports/coverage.html — the product: an HTML Requirements Traceability Matrix.
 *
 * Per requirement it shows: status, linked tests, pass / fail / flaky / skipped,
 * coverage gaps (uncovered), and BLOCKED state — if a dependency's test failed,
 * the dependent is marked blocked rather than reported as an independent failure,
 * because running it would emit a false signal.
 *
 * Groupable by requirement and by suite (the two tagging axes).
 *
 * Correlation between a requirement and its test results is by, in order:
 *   1. the requirement-ID tag on the test  (e.g. @FR-AUTH-001)   ← primary
 *   2. the requirement ID appearing in the test title
 *   3. a linked_tests path matching the test file
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const INDEX_PATH = path.join(ROOT, 'requirements', 'index.md');
const RESULTS_DIR = path.join(ROOT, 'test-results');
const OUT_DIR = path.join(ROOT, 'reports');
const OUT_PATH = path.join(OUT_DIR, 'coverage.html');

type Outcome = 'pass' | 'fail' | 'flaky' | 'skipped';
type Coverage = Outcome | 'uncovered' | 'no-results';
type Effective = Coverage | 'blocked';

interface RequirementMeta {
  id: string;
  title: string;
  status: string;
  depends_on: string[];
  linked_tests: string[];
  path: string;
}

interface SpecResult {
  title: string;
  file: string;
  tags: string[];
  reqTags: string[]; // requirement-axis tags (@FR-…)
  suiteTags: string[]; // suite-axis tags (everything else)
  outcome: Outcome;
}

const toPosix = (p: string): string => p.split(/[\\/]/).join('/');
const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Parse the metadata-only index ────────────────────────────────────────────
function parseIndex(md: string): RequirementMeta[] {
  const rows: RequirementMeta[] = [];
  let inTable = false;
  const strip = (s: string): string => s.replace(/`/g, '').replace(/\\\|/g, '|').trim();
  const parseList = (s: string): string[] => {
    const t = strip(s);
    if (!t || t === '—') return [];
    return t
      .split(',')
      .map((x) => x.replace(/`/g, '').trim())
      .filter(Boolean);
  };

  for (const line of md.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) {
      inTable = false;
      continue;
    }
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if ((cells[0] ?? '').toLowerCase() === 'id') {
      inTable = true; // header row
      continue;
    }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue; // separator row
    if (!inTable || cells.length < 6) continue;

    rows.push({
      id: strip(cells[0] ?? ''),
      title: strip(cells[1] ?? ''),
      status: strip(cells[2] ?? '') || 'documented',
      depends_on: parseList(cells[3] ?? ''),
      linked_tests: parseList(cells[4] ?? ''),
      path: strip(cells[5] ?? ''),
    });
  }
  return rows;
}

// ── Find the latest run and parse its Playwright JSON ────────────────────────
async function findLatestRun(): Promise<{ run: string; json: any } | null> {
  let names: string[];
  try {
    names = (await fs.readdir(RESULTS_DIR, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort(); // ISO-ish timestamps sort chronologically
  } catch {
    return null;
  }
  for (const run of names.reverse()) {
    try {
      const raw = await fs.readFile(path.join(RESULTS_DIR, run, 'results.json'), 'utf8');
      return { run, json: JSON.parse(raw) };
    } catch {
      /* no results.json in this folder — keep looking */
    }
  }
  return null;
}

// Playwright's JSON reporter stores tags WITHOUT the leading "@"; the inline
// title style keeps it. Normalize to exactly one "@" so both forms compare equal.
const normTag = (t: unknown): string => '@' + String(t).replace(/^@+/, '');

// Requirement-axis tags look like @FR-AUTH-001 (area code + number). Anything
// else (@smoke, @sprint10) is a suite-axis tag.
const isReqTag = (tag: string): boolean => /^@[A-Za-z]{2,}-[A-Za-z0-9]+-\d+$/i.test(tag);

function flattenSpecs(json: any): SpecResult[] {
  const out: SpecResult[] = [];
  const walk = (suite: any, parentFile: string): void => {
    const file = suite.file ?? parentFile;
    for (const spec of suite.specs ?? []) {
      const tests = spec.tests ?? [];
      const statuses: string[] = tests.map((t: any) => String(t.status));
      let outcome: Outcome = 'pass';
      if (spec.ok === false || statuses.some((s) => s === 'unexpected' || s === 'interrupted')) outcome = 'fail';
      else if (statuses.includes('flaky')) outcome = 'flaky';
      else if (statuses.length > 0 && statuses.every((s) => s === 'skipped')) outcome = 'skipped';

      // Tags from the tag option, unioned with any @tokens in the title, all
      // normalized to a single leading "@".
      const fromTitle = String(spec.title ?? '').match(/@[\w-]+/g) ?? [];
      const tags = Array.from(new Set([...(spec.tags ?? []), ...fromTitle].map(normTag)));

      out.push({
        title: String(spec.title ?? ''),
        file: toPosix(spec.file ?? file ?? ''),
        tags,
        reqTags: tags.filter(isReqTag),
        suiteTags: tags.filter((t) => !isReqTag(t)),
        outcome,
      });
    }
    for (const child of suite.suites ?? []) walk(child, file);
  };
  for (const suite of json?.suites ?? []) walk(suite, suite.file ?? '');
  return out;
}

const sameFile = (a: string, b: string): boolean => {
  const na = toPosix(a);
  const nb = toPosix(b);
  return na === nb || na.endsWith(nb) || nb.endsWith(na) || na.split('/').pop() === nb.split('/').pop();
};

function correlate(req: RequirementMeta, specs: SpecResult[]): SpecResult[] {
  const idTag = `@${req.id}`.toLowerCase();
  return specs.filter(
    (s) =>
      s.tags.some((t) => t.toLowerCase() === idTag) ||
      s.title.includes(req.id) ||
      req.linked_tests.some((lt) => sameFile(lt, s.file)),
  );
}

function aggregate(specs: SpecResult[]): Outcome {
  if (specs.some((s) => s.outcome === 'fail')) return 'fail';
  if (specs.some((s) => s.outcome === 'flaky')) return 'flaky';
  if (specs.length > 0 && specs.every((s) => s.outcome === 'skipped')) return 'skipped';
  return 'pass';
}

// ── Build view model ─────────────────────────────────────────────────────────
interface Row {
  req: RequirementMeta;
  specs: SpecResult[];
  coverage: Coverage;
  effective: Effective;
  blockedBy: string[];
  notes: string[];
  suites: string[];
}

function build(reqs: RequirementMeta[], specs: SpecResult[]): Row[] {
  const byId = new Map(reqs.map((r) => [r.id, r] as const));

  // Pass 1 — each requirement's own coverage.
  const cov = new Map<string, Coverage>();
  const related = new Map<string, SpecResult[]>();
  for (const req of reqs) {
    const rel = correlate(req, specs);
    related.set(req.id, rel);
    let coverage: Coverage;
    if (rel.length > 0) coverage = aggregate(rel);
    else coverage = req.linked_tests.length > 0 ? 'no-results' : 'uncovered';
    cov.set(req.id, coverage);
  }

  // Pass 2 — blocked propagation: blocked if any dependency (transitively) failed
  // or is itself blocked. Fixed point, cycle-safe.
  const blocked = new Set<string>();
  for (let i = 0; i < reqs.length + 1; i++) {
    let changed = false;
    for (const req of reqs) {
      if (blocked.has(req.id)) continue;
      if (req.depends_on.some((d) => cov.get(d) === 'fail' || blocked.has(d))) {
        blocked.add(req.id);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return reqs.map((req) => {
    const rel = related.get(req.id) ?? [];
    const coverage = cov.get(req.id) ?? 'uncovered';
    const blockedBy = req.depends_on.filter((d) => cov.get(d) === 'fail' || blocked.has(d));
    const notes: string[] = [];

    for (const d of req.depends_on) {
      const dep = byId.get(d);
      if (!dep) notes.push(`depends on ${d} (undocumented — not in index)`);
      else if (dep.status === 'assumed' || dep.status === 'undocumented')
        notes.push(`depends on ${d} (${dep.status})`);
    }
    if (coverage === 'uncovered') notes.push('no test yet');
    if (coverage === 'no-results') notes.push('linked test not in latest run');

    return {
      req,
      specs: rel,
      coverage,
      effective: blocked.has(req.id) ? 'blocked' : coverage,
      blockedBy,
      notes,
      suites: Array.from(new Set(rel.flatMap((s) => s.suiteTags))).sort(),
    };
  });
}

// ── Render ───────────────────────────────────────────────────────────────────
const badge = (kind: string, label = kind): string =>
  `<span class="badge b-${escapeHtml(kind)}">${escapeHtml(label)}</span>`;

function render(rows: Row[], run: string | null, stats: any, generatedAt: string): string {
  const allSuites = Array.from(new Set(rows.flatMap((r) => r.suites))).sort();

  const count = (pred: (r: Row) => boolean): number => rows.filter(pred).length;
  const summary = {
    total: rows.length,
    documented: count((r) => r.req.status === 'documented'),
    assumed: count((r) => r.req.status === 'assumed'),
    undocumented: count((r) => r.req.status === 'undocumented'),
    covered: count((r) => r.req.linked_tests.length > 0),
    passing: count((r) => r.effective === 'pass'),
    failing: count((r) => r.effective === 'fail'),
    blocked: count((r) => r.effective === 'blocked'),
    uncovered: count((r) => r.effective === 'uncovered'),
  };

  // By-requirement rows.
  const reqRows = rows
    .map((r) => {
      const linked = r.req.linked_tests.length
        ? r.req.linked_tests.map((t) => `<code>${escapeHtml(t)}</code>`).join('<br>')
        : '—';
      const deps = r.req.depends_on.length
        ? r.req.depends_on.map((d) => `<code>${escapeHtml(d)}</code>`).join(', ')
        : '—';
      const blockedBy = r.blockedBy.length ? r.blockedBy.map((d) => `<code>${escapeHtml(d)}</code>`).join(', ') : '—';
      const notes = r.notes.length ? r.notes.map(escapeHtml).join('<br>') : '';
      return `      <tr data-suites="${escapeHtml(r.suites.join(' '))}" data-result="${r.effective}">
        <td><code>${escapeHtml(r.req.id)}</code></td>
        <td>${escapeHtml(r.req.title)}</td>
        <td>${badge('s-' + r.req.status, r.req.status)}</td>
        <td>${badge(r.effective)}</td>
        <td>${linked}</td>
        <td>${deps}</td>
        <td>${blockedBy}</td>
        <td class="notes">${notes}</td>
      </tr>`;
    })
    .join('\n');

  // By-suite sections.
  const suiteSections = allSuites.length
    ? allSuites
        .map((suite) => {
          const inSuite = rows.filter((r) => r.suites.includes(suite));
          const items = inSuite
            .flatMap((r) =>
              r.specs
                .filter((s) => s.suiteTags.includes(suite))
                .map(
                  (s) => `        <tr>
          <td>${escapeHtml(s.title)}</td>
          <td><code>${escapeHtml(s.file)}</code></td>
          <td>${s.reqTags.map((t) => `<code>${escapeHtml(t)}</code>`).join(' ') || '—'}</td>
          <td>${badge(s.outcome)}</td>
        </tr>`,
                ),
            )
            .join('\n');
          return `    <h3>${escapeHtml(suite)} <span class="muted">(${inSuite.length} requirement(s))</span></h3>
    <table>
      <thead><tr><th>Test</th><th>File</th><th>Covers</th><th>Result</th></tr></thead>
      <tbody>
${items}
      </tbody>
    </table>`;
        })
        .join('\n')
    : '<p class="muted">No suite tags found in the latest run.</p>';

  const suiteChips = ['all', ...allSuites]
    .map(
      (s) =>
        `<button class="chip${s === 'all' ? ' active' : ''}" data-suite="${escapeHtml(s)}">${escapeHtml(s)}</button>`,
    )
    .join('');

  const runBanner = run
    ? `Latest run: <code>${escapeHtml(run)}</code> · expected ${stats?.expected ?? '?'} · unexpected ${stats?.unexpected ?? '?'} · flaky ${stats?.flaky ?? '?'} · skipped ${stats?.skipped ?? '?'}`
    : `<strong>No test run found.</strong> Run <code>npm test</code>, then <code>npm run gen:report</code>.`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Coverage &amp; Traceability — AI QA Pipeline</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font: 15px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; padding: 2rem; background: #f6f7f9; color: #1b1f24; }
  h1 { margin: 0 0 .25rem; font-size: 1.5rem; }
  h2 { margin: 2rem 0 .75rem; font-size: 1.15rem; }
  h3 { margin: 1.5rem 0 .5rem; font-size: 1rem; }
  .muted { color: #6b7280; font-weight: 400; }
  .banner { color: #374151; margin: .25rem 0 1.5rem; }
  code { background: #eceff3; padding: .1em .35em; border-radius: 4px; font-size: .85em; }
  .cards { display: flex; flex-wrap: wrap; gap: .75rem; margin: 1rem 0 1.5rem; }
  .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: .75rem 1rem; min-width: 96px; }
  .card .n { font-size: 1.5rem; font-weight: 700; }
  .card .l { font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; }
  table { border-collapse: collapse; width: 100%; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
  th, td { text-align: left; padding: .55rem .7rem; border-bottom: 1px solid #eef0f3; vertical-align: top; }
  th { background: #f3f4f6; font-size: .78rem; text-transform: uppercase; letter-spacing: .03em; color: #4b5563; }
  tr:last-child td { border-bottom: 0; }
  td.notes { color: #6b7280; font-size: .85em; }
  .badge { display: inline-block; padding: .12em .55em; border-radius: 999px; font-size: .76rem; font-weight: 600; border: 1px solid transparent; }
  .b-pass { background: #e7f6ec; color: #1a7f37; }
  .b-fail { background: #fdeaea; color: #b42318; }
  .b-flaky { background: #fff4e5; color: #b54708; }
  .b-skipped { background: #eceff3; color: #4b5563; }
  .b-uncovered { background: #fef6e7; color: #92610a; border-color: #f2d28a; }
  .b-no-results { background: #eef2ff; color: #3538cd; }
  .b-blocked { background: #f3e8ff; color: #6d28d9; }
  .s-documented { background: #e7f6ec; color: #1a7f37; }
  .s-assumed { background: #fff4e5; color: #b54708; }
  .s-undocumented { background: #fdeaea; color: #b42318; }
  .controls { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; margin: .5rem 0 1rem; }
  .chip, .tab { border: 1px solid #d1d5db; background: #fff; border-radius: 999px; padding: .3rem .8rem; font-size: .85rem; cursor: pointer; }
  .chip.active, .tab.active { background: #1b1f24; color: #fff; border-color: #1b1f24; }
  .legend { font-size: .82rem; color: #4b5563; margin-top: 2rem; }
  .legend .badge { margin-right: .25rem; }
  .hidden { display: none; }
  footer { margin-top: 2rem; font-size: .8rem; color: #9ca3af; }
</style>
</head>
<body>
  <h1>Coverage &amp; Traceability Matrix</h1>
  <div class="banner">${runBanner}</div>

  <div class="cards">
    <div class="card"><div class="n">${summary.total}</div><div class="l">Requirements</div></div>
    <div class="card"><div class="n">${summary.covered}</div><div class="l">Covered</div></div>
    <div class="card"><div class="n">${summary.passing}</div><div class="l">Passing</div></div>
    <div class="card"><div class="n">${summary.failing}</div><div class="l">Failing</div></div>
    <div class="card"><div class="n">${summary.blocked}</div><div class="l">Blocked</div></div>
    <div class="card"><div class="n">${summary.uncovered}</div><div class="l">Uncovered</div></div>
  </div>

  <div class="controls">
    <strong>View:</strong>
    <button class="tab active" data-view="by-requirement">By requirement</button>
    <button class="tab" data-view="by-suite">By suite</button>
  </div>

  <section id="by-requirement">
    <div class="controls">
      <strong>Filter by suite:</strong>
      ${suiteChips}
    </div>
    <table>
      <thead>
        <tr><th>ID</th><th>Title</th><th>Status</th><th>Result</th><th>Linked tests</th><th>Depends on</th><th>Blocked by</th><th>Notes</th></tr>
      </thead>
      <tbody>
${reqRows}
      </tbody>
    </table>
  </section>

  <section id="by-suite" class="hidden">
${suiteSections}
  </section>

  <div class="legend">
    <strong>Legend.</strong>
    Status: ${badge('s-documented', 'documented')} ${badge('s-assumed', 'assumed')} ${badge('s-undocumented', 'undocumented')} &nbsp;·&nbsp;
    Result: ${badge('pass')} ${badge('fail')} ${badge('flaky')} ${badge('skipped')} ${badge('blocked')} ${badge('uncovered')} ${badge('no-results')}
    <p>A requirement is <em>blocked</em> when a dependency's test failed — running it would be a false signal, so it is not reported as an independent failure.</p>
  </div>

  <footer>Generated ${escapeHtml(generatedAt)} by <code>npm run gen:report</code> — deterministic, no AI. Source: <code>requirements/index.md</code> + latest <code>test-results/</code>.</footer>

<script>
  // View toggle.
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const view = tab.getAttribute('data-view');
      document.getElementById('by-requirement').classList.toggle('hidden', view !== 'by-requirement');
      document.getElementById('by-suite').classList.toggle('hidden', view !== 'by-suite');
    });
  }
  // Suite filter (operates on the by-requirement table).
  for (const chip of document.querySelectorAll('.chip')) {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const suite = chip.getAttribute('data-suite');
      for (const row of document.querySelectorAll('#by-requirement tbody tr')) {
        const suites = (row.getAttribute('data-suites') || '').split(' ').filter(Boolean);
        row.classList.toggle('hidden', suite !== 'all' && !suites.includes(suite));
      }
    });
  }
</script>
</body>
</html>
`;
}

async function main(): Promise<void> {
  let indexMd: string;
  try {
    indexMd = await fs.readFile(INDEX_PATH, 'utf8');
  } catch {
    console.error(`✗ ${toPosix(path.relative(ROOT, INDEX_PATH))} not found. Run \`npm run gen:index\` first.`);
    process.exit(1);
    return;
  }

  const reqs = parseIndex(indexMd);
  const latest = await findLatestRun();
  const specs = latest ? flattenSpecs(latest.json) : [];
  const rows = build(reqs, specs);
  const generatedAt = new Date().toISOString();
  const html = render(rows, latest?.run ?? null, latest?.json?.stats, generatedAt);

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_PATH, html, 'utf8');

  const covered = rows.filter((r) => r.req.linked_tests.length > 0).length;
  console.log(
    `✓ Wrote ${toPosix(path.relative(ROOT, OUT_PATH))} — ${reqs.length} requirement(s), ${covered} covered` +
      (latest ? `, run ${latest.run}.` : `, no test run found.`),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
