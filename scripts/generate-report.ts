// Reads requirements/index.md + latest test-results/<run>/results.json → reports/coverage.html (RTM).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  resolveTheme,
  themeStyle,
  backdrop,
  floatingNav,
  motionScript,
  faviconUri,
  ICONS,
  type Theme,
} from './assets/report-theme.ts';

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
      inTable = true;
      continue;
    }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
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

async function findLatestRun(): Promise<{ run: string; json: any } | null> {
  let names: string[];
  try {
    names = (await fs.readdir(RESULTS_DIR, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort(); // ISO timestamps sort lexicographically = chronologically
  } catch {
    return null;
  }
  for (const run of names.reverse()) {
    try {
      const raw = await fs.readFile(path.join(RESULTS_DIR, run, 'results.json'), 'utf8');
      return { run, json: JSON.parse(raw) };
    } catch {
      // no results.json — try next
    }
  }
  return null;
}

// Normalize to one leading "@" — Playwright JSON omits it, inline titles keep it.
const normTag = (t: unknown): string => '@' + String(t).replace(/^@+/, '');

// Req tags: @AREA-CODE-NNN (e.g. @FR-AUTH-001). Anything else is a suite tag.
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

  // Pass 1: raw coverage per requirement.
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

  // Pass 2: propagate blocked state transitively; fixed-point loop is cycle-safe.
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

const pct = (n: number, d: number): number => (d > 0 ? Math.round((n / d) * 100) : 0);

const RESULT_LABEL: Record<string, string> = {
  pass: 'pass',
  fail: 'fail',
  flaky: 'flaky',
  skipped: 'skipped',
  uncovered: 'uncovered',
  'no-results': 'not run',
  blocked: 'blocked',
};
const resultClass = (eff: string): string => 'b-' + eff;
const meterClass = (eff: string): string => 'm-' + (eff === 'no-results' ? 'notrun' : eff);
const resultBadge = (eff: string): string =>
  `<span class="badge ${resultClass(eff)}"><i class="dot"></i>${escapeHtml(RESULT_LABEL[eff] ?? eff)}</span>`;
const statusBadge = (status: string): string =>
  `<span class="badge s-${escapeHtml(status)}"><i class="dot"></i>${escapeHtml(status)}</span>`;

// RTM Verified column: one mark per requirement derived from effective state.
const VERIFY: Record<string, { g: string; c: string; t: string }> = {
  pass: { g: '✓', c: 'v-pass', t: 'Verified — linked test passing' },
  fail: { g: '✗', c: 'v-fail', t: 'Not verified — test failing' },
  flaky: { g: '≈', c: 'v-flaky', t: 'Unstable — intermittent result' },
  blocked: { g: '◑', c: 'v-blocked', t: 'Pending — a dependency is failing' },
  'no-results': { g: '·', c: 'v-amber', t: 'Not run in the latest suite' },
  skipped: { g: '–', c: 'v-grey', t: 'Skipped in the latest run' },
  uncovered: { g: '—', c: 'v-grey', t: 'No linked test yet' },
};
const verifyCell = (eff: string): string => {
  const v = VERIFY[eff] ?? VERIFY.uncovered;
  return `<span class="verdict ${v.c}" title="${escapeHtml(v.t)}" aria-label="${escapeHtml(v.t)}">${v.g}</span>`;
};

// coverage.html is one level under root; req paths are root-relative, specs are tests/-relative.
const reqHref = (p: string): string => '../' + toPosix(p);
const specHref = (file: string): string => {
  const f = toPosix(file);
  return '../' + (f.startsWith('tests/') ? f : 'tests/' + f);
};

function render(rows: Row[], run: string | null, stats: any, generatedAt: string, theme: Theme): string {
  const allSuites = Array.from(new Set(rows.flatMap((r) => r.suites))).sort();

  const count = (pred: (r: Row) => boolean): number => rows.filter(pred).length;
  const total = rows.length;
  const covered = count((r) => r.req.linked_tests.length > 0);
  const passing = count((r) => r.effective === 'pass');
  const failing = count((r) => r.effective === 'fail');
  const blocked = count((r) => r.effective === 'blocked');
  const uncovered = count((r) => r.effective === 'uncovered');
  const coveredPct = pct(covered, total);

  const DIST_ORDER: Effective[] = ['pass', 'flaky', 'fail', 'blocked', 'no-results', 'skipped', 'uncovered'];
  const distSegments = DIST_ORDER.map((e) => ({ e, n: count((r) => r.effective === e) })).filter((d) => d.n > 0);
  const meterBar = total
    ? distSegments
        .map(
          (d) =>
            `<span class="seg ${meterClass(d.e)}" style="flex-grow:${d.n}" title="${escapeHtml(
              RESULT_LABEL[d.e] ?? d.e,
            )}: ${d.n}"></span>`,
        )
        .join('')
    : '<span class="seg m-uncovered" style="flex-grow:1"></span>';
  const meterLegend = total
    ? distSegments
        .map(
          (d) =>
            `<span class="lg"><i class="swatch ${meterClass(d.e)}"></i>${escapeHtml(RESULT_LABEL[d.e] ?? d.e)} <b>${
              d.n
            }</b></span>`,
        )
        .join('')
    : '<span class="lg muted">No requirements yet</span>';
  const meterAria = distSegments.map((d) => `${d.n} ${RESULT_LABEL[d.e] ?? d.e}`).join(', ') || 'no requirements';

  const genDate = generatedAt.slice(0, 10);
  const docStamp = run ? (failing ? 'Action required' : blocked ? 'Review' : 'Controlled copy') : 'Draft';

  const docRow = (k: string, v: string): string =>
    `<div class="doc-row"><dt>${escapeHtml(k)}</dt><dd>${v}</dd></div>`;

  const docMeta = `<div class="doc-meta">
              <div class="doc-meta-head"><span>Document control</span><span class="doc-stamp">${escapeHtml(
                docStamp,
              )}</span></div>
              <dl class="doc-dl">
                ${docRow('Document', '<b>RTM-001</b>')}
                ${docRow('Revision', `<span class="tnum">${escapeHtml(genDate)}</span>`)}
                ${docRow('Requirements', `<span class="tnum">${total}</span>`)}
                ${docRow('Coverage', `<span class="tnum">${coveredPct}% · ${covered}/${total}</span>`)}
                ${docRow('Verified passing', `<span class="tnum">${passing}/${total}</span>`)}
                ${docRow(
                  'Latest run',
                  run ? `<code>${escapeHtml(run)}</code>` : '<span class="muted">none yet</span>',
                )}
              </dl>
            </div>`;

  const summaryHero = `<div class="shell hero-shell">
        <div class="core hero-core doc-hero">
          <div class="hero-aura" aria-hidden="true"></div>
          <div class="hero-top">
            <div class="hero-lead">
              <span class="eyebrow"><i class="eyebrow-dot"></i>Quality record</span>
              <h1 class="doc-title">Requirements Traceability Matrix</h1>
              <p class="figure-sub">The formal record: every requirement traced to its test cases, verification result, and dependency state — generated from the index and the latest run, never hand-kept. ${covered} of ${total} requirement${
                total === 1 ? '' : 's'
              } covered, ${passing} verified passing${uncovered ? `, ${uncovered} uncovered` : ''}${
                blocked ? `, ${blocked} blocked` : ''
              }.</p>
              <div class="hero-cta">
                <a class="btn btn-primary group" href="#matrix">
                  <span>Open the matrix</span>
                  <span class="btn-ico" aria-hidden="true">${ICONS.arrow}</span>
                </a>
                <a class="btn btn-ghost" href="./dashboard.html"><span>Live dashboard</span></a>
              </div>
            </div>
            <div class="hero-stats">
            ${docMeta}
            </div>
          </div>
          <div class="meter" role="img" aria-label="Requirement outcomes: ${escapeHtml(meterAria)}.">${meterBar}</div>
          <div class="legend">${meterLegend}</div>
        </div>
      </div>`;

  const navHealth = run
    ? `<span class="nav-health ${failing ? 'is-fail' : 'is-pass'}"><i class="dot"></i>${
        failing ? `${failing} failing` : `${passing}/${total} passing`
      }</span>`
    : '<span class="nav-health is-idle"><i class="dot"></i>no run yet</span>';

  const lastRun = run
    ? `<div class="grid">
        <div class="kv"><div class="k">Run</div><div class="v"><code>${escapeHtml(run)}</code></div></div>
        <div class="kv"><div class="k">Results</div><div class="v">
          ${resultBadge('pass')} ${stats?.expected ?? 0}
          &nbsp; ${resultBadge('fail')} ${stats?.unexpected ?? 0}
          &nbsp; ${resultBadge('flaky')} ${stats?.flaky ?? 0}
          &nbsp; ${resultBadge('skipped')} ${stats?.skipped ?? 0}
        </div></div>
      </div>`
    : `<div class="notice">No test run found — run <code>npm test</code>, then <code>npm run gen:report</code>.</div>`;

  const cell = (xs: string[], wrap: (x: string) => string): string =>
    xs.length ? xs.map(wrap).join(' ') : '<span class="muted">—</span>';

  const reqRows = rows
    .map((r, i) => {
      const linked = r.req.linked_tests.length
        ? r.req.linked_tests
            .map((t) => `<a href="${escapeHtml(specHref(t))}"><code>${escapeHtml(t)}</code></a>`)
            .join('<br>')
        : '<span class="muted">—</span>';
      const deps = cell(r.req.depends_on, (d) => `<code>${escapeHtml(d)}</code>`);
      // Fold blockedBy into Notes — avoids an extra column in the grid.
      const noteParts = [...r.notes];
      if (r.blockedBy.length) noteParts.unshift('Blocked by ' + r.blockedBy.join(', '));
      const notes = noteParts.length ? noteParts.map(escapeHtml).join('<br>') : '<span class="muted">—</span>';
      return `        <tr data-suites="${escapeHtml(r.suites.join(' '))}">
          <td class="rownum tnum">${i + 1}</td>
          <td class="col-id"><a href="${escapeHtml(reqHref(r.req.path))}"><code>${escapeHtml(r.req.id)}</code></a></td>
          <td class="col-req">${escapeHtml(r.req.title)}</td>
          <td>${statusBadge(r.req.status)}</td>
          <td>${linked}</td>
          <td>${deps}</td>
          <td>${resultBadge(r.effective)}</td>
          <td class="col-verify">${verifyCell(r.effective)}</td>
          <td class="notes">${notes}</td>
        </tr>`;
    })
    .join('\n');

  const suitePills = ['all', ...allSuites]
    .map(
      (s) =>
        `<button class="pill${s === 'all' ? ' active' : ''}" data-suite="${escapeHtml(s)}">${escapeHtml(
          s === 'all' ? 'All suites' : s,
        )}</button>`,
    )
    .join('');

  const suiteBlocks = allSuites.length
    ? allSuites
        .map((suite) => {
          const inSuite = rows.filter((r) => r.suites.includes(suite));
          const items = inSuite
            .flatMap((r) =>
              r.specs
                .filter((s) => s.suiteTags.includes(suite))
                .map(
                  (s) => `        <tr>
          <td><a href="${escapeHtml(specHref(s.file))}">${escapeHtml(s.title)}</a><div class="muted small"><code>${escapeHtml(
            s.file,
          )}</code></div></td>
          <td>${cell(s.reqTags, (t) => `<span class="badge req-badge">${escapeHtml(t)}</span>`)}</td>
          <td>${resultBadge(s.outcome)}</td>
        </tr>`,
                ),
            )
            .join('\n');
          return `    <div class="suite-block">
      <div class="suite-block-head"><span class="badge suite-badge">${escapeHtml(
        suite,
      )}</span> <span class="muted small">${inSuite.length} requirement${inSuite.length === 1 ? '' : 's'}</span></div>
      <div class="shell"><div class="core table-wrap">
        <table>
          <thead><tr><th>Test</th><th>Covers</th><th>Result</th></tr></thead>
          <tbody>
${items}
          </tbody>
        </table>
      </div></div>
    </div>`;
        })
        .join('\n')
    : '    <p class="muted">No suite tags found in the latest run.</p>';

  const legend = `    <div class="attn">
      <h3><span>Legend</span></h3>
      <p class="muted">The status and result vocabulary used across the matrix.</p>
      <div class="legend-rows">
        <div class="legend-row"><span class="legend-k">Status</span>${statusBadge('documented')} ${statusBadge(
          'assumed',
        )} ${statusBadge('undocumented')}</div>
        <div class="legend-row"><span class="legend-k">Result</span>${resultBadge('pass')} ${resultBadge(
          'fail',
        )} ${resultBadge('flaky')} ${resultBadge('skipped')} ${resultBadge('blocked')} ${resultBadge(
          'uncovered',
        )} ${resultBadge('no-results')}</div>
      </div>
      <p class="muted" style="margin-top:.8rem">A requirement is <em>blocked</em> when a dependency's test failed — running it would be a false signal, so it is not reported as an independent failure.</p>
    </div>`;

  const NAV: ReadonlyArray<readonly [string, string]> = [
    ['summary', 'Summary'],
    ['matrix', 'Matrix'],
    ['by-suite', 'By suite'],
    ['legend', 'Legend'],
  ];

  // Page-local CSS: doc-cover hero + spreadsheet-style matrix grid.
  const localCss = `
  .suite-block { margin-bottom: 1.4rem; }
  .suite-block:last-child { margin-bottom: 0; }
  .suite-block-head { display: flex; align-items: center; gap: .6rem; margin: 0 .2rem .7rem; }
  .legend-rows { display: grid; gap: .7rem; margin-top: .9rem; }
  .legend-row { display: flex; align-items: center; flex-wrap: wrap; gap: .4rem; }
  .legend-k { font-size: .66rem; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-3); margin-right: .4rem; min-width: 3.4rem; }

  /* Document-cover hero — a serif title + a document-control record block,
     deliberately NOT the dashboard's big-number KPI tiles. */
  .doc-title { margin: .25rem 0 0; font-family: var(--display); font-size: clamp(2rem, 4.6vw, 3.15rem); font-weight: 540; line-height: 1.04; letter-spacing: -.02em; color: var(--ink-0); text-wrap: balance; font-variation-settings: "opsz" 132; }
  .doc-hero .figure-sub { max-width: 50ch; }
  .doc-hero .hero-stats { display: block; min-width: min(100%, 360px); }
  .doc-meta { width: 100%; border: 1px solid var(--line); border-radius: 16px; background: var(--panel-bg); box-shadow: var(--inset), var(--shadow-soft); overflow: hidden; }
  .doc-meta-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .6rem .95rem; background: var(--th-grid); border-bottom: 1px solid var(--line-2); font-family: var(--mono); font-size: .64rem; text-transform: uppercase; letter-spacing: .12em; color: var(--ink-2); }
  .doc-stamp { color: var(--accent); border: 1px solid var(--accent-line); border-radius: 999px; padding: .14rem .5rem; font-size: .58rem; letter-spacing: .08em; }
  .doc-dl { margin: 0; }
  .doc-row { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; padding: .5rem .95rem; border-top: 1px solid var(--line); }
  .doc-row:first-child { border-top: 0; }
  .doc-row dt { font-size: .63rem; text-transform: uppercase; letter-spacing: .07em; color: var(--ink-3); }
  .doc-row dd { margin: 0; font-size: .9rem; color: var(--ink-0); text-align: right; font-variant-numeric: tabular-nums; }
  .doc-row dd code { font-size: .73rem; }
  .doc-row dd b { font-weight: 600; }

  /* Standard workplace RTM — a ruled spreadsheet grid: a titled caption band,
     cell gridlines, zebra rows, a strong header, row numbers, Verified marks. */
  .matrix-caption { display: flex; align-items: center; justify-content: space-between; gap: .5rem 1.4rem; flex-wrap: wrap; padding: .72rem 1rem; background: var(--th-grid); border-bottom: 1px solid var(--line-2); }
  .matrix-caption .mc-title { font-family: var(--display); font-size: 1rem; font-weight: 560; letter-spacing: -.01em; color: var(--ink-0); }
  .matrix-caption .mc-meta { display: flex; align-items: center; flex-wrap: wrap; gap: .45rem .75rem; font-size: .72rem; color: var(--ink-2); }
  .matrix-caption .mc-meta b { color: var(--ink-0); font-weight: 600; }
  .matrix-caption .mc-sep { width: 1px; height: 11px; background: var(--line-2); }
  table.matrix-grid { min-width: 860px; }
  .matrix-grid th, .matrix-grid td { border-right: 1px solid var(--grid-line); padding: .54rem .72rem; }
  .matrix-grid th:last-child, .matrix-grid td:last-child { border-right: 0; }
  .matrix-grid thead th { background: var(--th-grid); color: var(--ink-2); border-bottom: 1.5px solid var(--line-2); }
  .matrix-grid tbody td { border-bottom: 1px solid var(--grid-line); }
  .matrix-grid tbody tr:nth-child(even) { background: var(--zebra); }
  .matrix-grid tbody tr:hover { background: var(--row-hover); }
  .matrix-grid .rownum { color: var(--ink-3); font-family: var(--mono); font-size: .72rem; text-align: right; white-space: nowrap; }
  .matrix-grid .th-num, .matrix-grid .rownum { width: 1%; }
  .matrix-grid .col-req { min-width: 11rem; color: var(--ink-0); }
  .matrix-grid .th-verify, .matrix-grid .col-verify { text-align: center; width: 1%; }
  .verdict { display: inline-block; font-size: 1.05rem; font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums; }
  .v-pass { color: var(--pass-fg); } .v-fail { color: var(--fail-fg); } .v-flaky { color: var(--flaky-fg); }
  .v-blocked { color: var(--blue-fg); } .v-amber { color: var(--amber-fg); } .v-grey { color: var(--ink-3); }`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="${theme === 'editorial' ? 'light' : 'dark'}" />
<meta name="theme-color" content="${theme === 'editorial' ? '#f4eddf' : '#050505'}" />
<meta name="description" content="TraceQA — the Requirements Traceability Matrix: the formal record of every requirement, its linked test cases, verification result, and dependency state. Generated offline from the requirements index and the latest Playwright run." />
<link rel="icon" href="${faviconUri(theme)}" />
<title>TraceQA — Requirements Traceability Matrix</title>
<style>${themeStyle(theme, 'matrix')}${localCss}</style>
</head>
<body>
${backdrop(theme)}

${floatingNav({ items: NAV, health: navHealth, tag: 'Traceability Matrix' })}

  <main>
    <section id="summary" class="hero reveal">
      ${summaryHero}
    </section>

    <section id="last-run" class="reveal">
      <div class="sec-head"><div class="sec-title"><span class="kicker">01</span><h2>Last run</h2></div></div>
      ${lastRun}
    </section>

    <section id="matrix" class="reveal">
      <div class="sec-head">
        <div class="sec-title"><span class="kicker">02</span><h2>Traceability matrix <span class="sec-count tnum">${total}</span></h2></div>
        <div class="filterbar">
          <span class="label">Suite</span>
          ${suitePills}
          <button class="clear-filters" type="button">Clear</button>
        </div>
      </div>
      <div class="shell"><div class="core">
        <div class="matrix-caption">
          <span class="mc-title">Requirements Traceability Matrix</span>
          <span class="mc-meta"><span>Doc&nbsp;<b>RTM-001</b></span><span class="mc-sep" aria-hidden="true"></span><span>Rev&nbsp;<b class="tnum">${escapeHtml(
            genDate,
          )}</b></span><span class="mc-sep" aria-hidden="true"></span><span>Source&nbsp;<code>requirements/index.md</code></span></span>
        </div>
        <div class="table-wrap">
          <table class="matrix-grid">
            <thead>
              <tr><th class="th-num">#</th><th>Req&nbsp;ID</th><th>Requirement</th><th>Status</th><th>Linked test case(s)</th><th>Depends on</th><th>Result</th><th class="th-verify">Verified</th><th>Notes</th></tr>
            </thead>
            <tbody>
${reqRows}
            </tbody>
          </table>
        </div>
      </div></div>
    </section>

    <section id="by-suite" class="reveal">
      <div class="sec-head"><div class="sec-title"><span class="kicker">03</span><h2>By suite <span class="sec-count tnum">${allSuites.length}</span></h2></div></div>
${suiteBlocks}
    </section>

    <section id="legend" class="reveal">
      <div class="sec-head"><div class="sec-title"><span class="kicker">04</span><h2>Legend</h2></div></div>
${legend}
    </section>
  </main>

  <footer>
    Generated ${escapeHtml(generatedAt)} by <code>npm run gen:report</code> — deterministic, no AI, no network.<br>
    Source: <code>requirements/index.md</code> + latest <code>test-results/</code>. A derived view — regenerate, never hand-edit.
  </footer>

<script>
(function () {
  var state = { suite: 'all' };
  function apply() {
    var rows = document.querySelectorAll('#matrix tbody tr');
    for (var i = 0; i < rows.length; i++) {
      var list = (rows[i].getAttribute('data-suites') || '').split(' ');
      rows[i].classList.toggle('hidden', state.suite !== 'all' && list.indexOf(state.suite) === -1);
    }
    var pills = document.querySelectorAll('.pill[data-suite]');
    for (var k = 0; k < pills.length; k++) {
      pills[k].classList.toggle('active', pills[k].getAttribute('data-suite') === state.suite);
    }
  }
  var pills = document.querySelectorAll('.pill[data-suite]');
  for (var p = 0; p < pills.length; p++) {
    pills[p].addEventListener('click', function () { state.suite = this.getAttribute('data-suite'); apply(); });
  }
  var clears = document.querySelectorAll('.clear-filters');
  for (var c = 0; c < clears.length; c++) {
    clears[c].addEventListener('click', function () { state.suite = 'all'; apply(); });
  }
  apply();
})();
</script>
${motionScript()}
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
  const theme = resolveTheme();
  const html = render(rows, latest?.run ?? null, latest?.json?.stats, generatedAt, theme);

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_PATH, html, 'utf8');

  const covered = rows.filter((r) => r.req.linked_tests.length > 0).length;
  console.log(
    `✓ Wrote ${toPosix(path.relative(ROOT, OUT_PATH))} [${theme}] — ${reqs.length} requirement(s), ${covered} covered` +
      (latest ? `, run ${latest.run}.` : `, no test run found.`),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
