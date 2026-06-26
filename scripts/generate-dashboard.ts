// Deterministic dashboard generator: reads requirements/index.md + latest test-results JSON, writes reports/dashboard.html.
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
const OUT_PATH = path.join(OUT_DIR, 'dashboard.html');

const NO_RESULTS_NOTICE = 'No test results found — run npm test first.';

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
  file: string; // posix, relative to the Playwright testDir (e.g. "auth/login.spec.ts")
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

// ISO-8601 folder names are lexically chronological — no mtime needed.
async function findLatestRun(): Promise<{ run: string; json: any } | null> {
  let names: string[];
  try {
    names = (await fs.readdir(RESULTS_DIR, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return null; // test-results/ missing entirely
  }
  for (const run of names.reverse()) {
    try {
      const raw = await fs.readFile(path.join(RESULTS_DIR, run, 'results.json'), 'utf8');
      return { run, json: JSON.parse(raw) };
    } catch {
      /* keep looking */
    }
  }
  return null;
}

// Normalize to exactly one "@" — Playwright JSON omits it, inline titles keep it.
const normTag = (t: unknown): string => '@' + String(t).replace(/^@+/, '');

// Req tags: @FR-AUTH-001 pattern. Everything else (@smoke, @sprint10) is a suite tag.
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

      // Union tag option + @tokens in title, normalized to single "@".
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

interface DepState {
  id: string;
  state: Effective | 'missing';
}
interface Row {
  req: RequirementMeta;
  specs: SpecResult[];
  coverage: Coverage;
  effective: Effective;
  blockedBy: string[];
  depStates: DepState[];
  suites: string[];
}

function build(reqs: RequirementMeta[], specs: SpecResult[]): Row[] {
  const byId = new Map(reqs.map((r) => [r.id, r] as const));

  // Pass 1: linked_tests with no correlated spec → "no-results", not passing.
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

  // Pass 2: transitive blocked propagation — fixed-point, cycle-safe.
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

  const effOf = (id: string): Effective => (blocked.has(id) ? 'blocked' : (cov.get(id) ?? 'uncovered'));

  return reqs.map((req) => {
    const rel = related.get(req.id) ?? [];
    const coverage = cov.get(req.id) ?? 'uncovered';
    return {
      req,
      specs: rel,
      coverage,
      effective: blocked.has(req.id) ? 'blocked' : coverage,
      blockedBy: req.depends_on.filter((d) => cov.get(d) === 'fail' || blocked.has(d)),
      depStates: req.depends_on.map((d) => ({ id: d, state: byId.has(d) ? effOf(d) : 'missing' })),
      suites: Array.from(new Set(rel.flatMap((s) => s.suiteTags))).sort(),
    };
  });
}

function fmtDuration(ms?: number): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m} m ${Math.round(s % 60)} s`;
}

function fmtTimestamp(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Format: "2026-06-22 13:27:06 UTC" — deterministic, locale-independent.
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

// Playwright serializes config.grep as {}, so argv is the only source for --grep.
function parseSuiteFilter(argv: unknown): string | null {
  if (!Array.isArray(argv)) return null;
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i]);
    if (a === '--grep' || a === '-g') return argv[i + 1] != null ? String(argv[i + 1]) : null;
    if (a.startsWith('--grep=')) return a.slice('--grep='.length);
  }
  return null;
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
  missing: 'missing',
};
const resultClass = (eff: string): string => 'b-' + (eff === 'no-results' ? 'notrun' : eff);
// Separate meter class prefix ("m-") avoids collision with soft badge backgrounds ("b-").
const meterClass = (eff: string): string => 'm-' + (eff === 'no-results' ? 'notrun' : eff);
// Dot inside badge keeps state legible without relying solely on colour.
const resultBadge = (eff: string): string =>
  `<span class="badge ${resultClass(eff)}"><i class="dot"></i>${escapeHtml(RESULT_LABEL[eff] ?? eff)}</span>`;
const statusBadge = (status: string): string =>
  `<span class="badge s-${escapeHtml(status)}"><i class="dot"></i>${escapeHtml(status)}</span>`;

// dashboard.html is one level below root; req paths are repo-relative, specs relative to tests/.
const reqHref = (p: string): string => '../' + toPosix(p);
const specHref = (file: string): string => {
  const f = toPosix(file);
  return '../' + (f.startsWith('tests/') ? f : 'tests/' + f);
};

function reqBadge(reqTag: string, byId: Map<string, RequirementMeta>): string {
  const id = reqTag.replace(/^@/, '');
  const req = byId.get(id);
  if (req) return `<a class="badge req-badge" href="${escapeHtml(reqHref(req.path))}">${escapeHtml(reqTag)}</a>`;
  return `<span class="badge req-badge">${escapeHtml(reqTag)}</span>`;
}

function linkedCell(r: Row): string {
  if (r.specs.length === 0) {
    if (r.req.linked_tests.length > 0)
      return `<span class="muted">${r.req.linked_tests.length} linked</span> ${resultBadge('no-results')}`;
    return '<span class="muted">none</span>';
  }
  const n = (o: Outcome): number => r.specs.filter((s) => s.outcome === o).length;
  const parts: string[] = [];
  if (n('pass')) parts.push(`<span class="pf pf-pass">${n('pass')}&#10003;</span>`);
  if (n('fail')) parts.push(`<span class="pf pf-fail">${n('fail')}&#10007;</span>`);
  if (n('flaky')) parts.push(`<span class="pf pf-flaky">${n('flaky')}&#8776;</span>`);
  if (n('skipped')) parts.push(`<span class="pf pf-skip">${n('skipped')}&#8856;</span>`);
  const word = r.specs.length === 1 ? 'test' : 'tests';
  return `<strong>${r.specs.length}</strong> <span class="muted">${word}</span> ${parts.join(' ')}`;
}

function depCell(r: Row): string {
  if (r.depStates.length === 0) return '<span class="muted">—</span>';
  return r.depStates
    .map((d) => {
      const b = d.state === 'missing' ? `<span class="badge b-fail"><i class="dot"></i>missing</span>` : resultBadge(d.state);
      return `<code>${escapeHtml(d.id)}</code> ${b}`;
    })
    .join('<br>');
}

interface RenderInput {
  rows: Row[];
  specs: SpecResult[];
  byId: Map<string, RequirementMeta>;
  run: string | null;
  stats: any;
  suiteFilterUsed: string | null;
  generatedAt: string;
  theme: Theme;
}

function render(input: RenderInput): string {
  const { rows, specs, byId, run, stats, suiteFilterUsed, generatedAt, theme } = input;
  const allSuites = Array.from(new Set(specs.flatMap((s) => s.suiteTags))).sort();
  const allReqTags = Array.from(new Set(specs.flatMap((s) => s.reqTags))).sort();

  const total = rows.length;
  const coveredCount = rows.filter((r) => r.req.linked_tests.length > 0).length;
  const passingCount = rows.filter((r) => r.effective === 'pass').length;
  const uncoveredCount = rows.filter((r) => r.effective === 'uncovered').length;
  const blockedCount = rows.filter((r) => r.effective === 'blocked').length;
  const failingCount = rows.filter((r) => r.effective === 'fail').length;
  const assumedCount = rows.filter((r) => r.req.status === 'assumed' || r.req.status === 'undocumented').length;

  // Each requirement lands in exactly one bucket — meter represents the full set.
  const DIST_ORDER: Effective[] = ['pass', 'flaky', 'fail', 'blocked', 'no-results', 'skipped', 'uncovered'];
  const distSegments = DIST_ORDER.map((e) => ({ e, n: rows.filter((r) => r.effective === e).length })).filter(
    (d) => d.n > 0,
  );
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

  const tile = (value: string, label: string, sub = ''): string =>
    `<div class="tile"><div class="tile-n tnum">${escapeHtml(value)}</div><div class="tile-l">${escapeHtml(
      label,
    )}</div>${sub ? `<div class="tile-s tnum">${escapeHtml(sub)}</div>` : ''}</div>`;

  const heroTiles = [
    tile(String(total), 'Requirements'),
    tile(pct(coveredCount, total) + '%', 'Covered', `${coveredCount}/${total}`),
    tile(pct(passingCount, total) + '%', 'Passing', `${passingCount}/${total}`),
    tile(String(uncoveredCount), 'Uncovered'),
    tile(String(blockedCount), 'Blocked'),
    tile(String(assumedCount), 'Assumed'),
  ].join('\n            ');

  const passPct = pct(passingCount, total);
  const summaryHero = `<div class="shell hero-shell">
        <div class="core hero-core">
          <div class="hero-aura" aria-hidden="true"></div>
          <div class="hero-top">
            <div class="hero-lead">
              <span class="eyebrow"><i class="eyebrow-dot"></i>Live test status</span>
              <p class="figure tnum">${passPct}<span class="unit">% passing</span></p>
              <p class="figure-sub">${passingCount} of ${total} requirement${
                total === 1 ? '' : 's'
              } passing as of the latest run · ${coveredCount} covered by tests${
                uncoveredCount ? ` · ${uncoveredCount} with no coverage yet` : ''
              }.</p>
              <div class="hero-cta">
                <a class="btn btn-primary group" href="./coverage.html">
                  <span>Open traceability matrix</span>
                  <span class="btn-ico" aria-hidden="true">${ICONS.arrow}</span>
                </a>
                <a class="btn btn-ghost" href="#requirements"><span>Browse requirements</span></a>
              </div>
            </div>
            <div class="hero-stats">
            ${heroTiles}
            </div>
          </div>
          <div class="meter" role="img" aria-label="Requirement outcomes: ${escapeHtml(meterAria)}.">${meterBar}</div>
          <div class="legend">${meterLegend}</div>
        </div>
      </div>`;

  const navHealth = run
    ? `<span class="nav-health ${failingCount ? 'is-fail' : 'is-pass'}"><i class="dot"></i>${
        failingCount ? `${failingCount} failing` : `${passingCount}/${total} passing`
      }</span>`
    : '<span class="nav-health is-idle"><i class="dot"></i>no run yet</span>';

  const lastRun = run
    ? `<div class="grid">
        <div class="kv"><div class="k">Run</div><div class="v"><code>${escapeHtml(run)}</code></div></div>
        <div class="kv"><div class="k">When</div><div class="v">${escapeHtml(fmtTimestamp(stats?.startTime))}</div></div>
        <div class="kv"><div class="k">Duration</div><div class="v">${escapeHtml(fmtDuration(stats?.duration))}</div></div>
        <div class="kv"><div class="k">Suite filter</div><div class="v">${
          suiteFilterUsed ? `<code>${escapeHtml(suiteFilterUsed)}</code>` : '<span class="muted">none — all tests</span>'
        }</div></div>
        <div class="kv"><div class="k">Results</div><div class="v">
          ${resultBadge('pass')} ${stats?.expected ?? 0}
          &nbsp; ${resultBadge('fail')} ${stats?.unexpected ?? 0}
          &nbsp; ${resultBadge('flaky')} ${stats?.flaky ?? 0}
          &nbsp; ${resultBadge('skipped')} ${stats?.skipped ?? 0}
        </div></div>
      </div>`
    : `<div class="notice">${escapeHtml(NO_RESULTS_NOTICE)}</div>`;

  const reqRows = rows
    .map(
      (r) => `        <tr data-suites="${escapeHtml(r.suites.join(' '))}">
          <td><a href="${escapeHtml(reqHref(r.req.path))}"><code>${escapeHtml(r.req.id)}</code></a></td>
          <td>${escapeHtml(r.req.title)}</td>
          <td>${statusBadge(r.req.status)}</td>
          <td>${linkedCell(r)}</td>
          <td>${resultBadge(r.effective)}</td>
          <td>${depCell(r)}</td>
        </tr>`,
    )
    .join('\n');

  const tcRows = specs.length
    ? specs
        .map((s) => {
          const reqs = s.reqTags.length
            ? s.reqTags.map((t) => reqBadge(t, byId)).join(' ')
            : '<span class="muted">—</span>';
          const suites = s.suiteTags.length
            ? s.suiteTags.map((t) => `<span class="badge suite-badge">${escapeHtml(t)}</span>`).join(' ')
            : '<span class="muted">—</span>';
          return `        <tr data-suites="${escapeHtml(s.suiteTags.join(' '))}" data-reqs="${escapeHtml(
            s.reqTags.join(' '),
          )}">
          <td><a href="${escapeHtml(specHref(s.file))}">${escapeHtml(s.title)}</a><div class="muted small"><code>${escapeHtml(
            s.file,
          )}</code></div></td>
          <td>${reqs}</td>
          <td>${suites}</td>
          <td>${resultBadge(s.outcome)}</td>
        </tr>`;
        })
        .join('\n')
    : `        <tr><td colspan="4"><div class="notice">${escapeHtml(NO_RESULTS_NOTICE)}</div></td></tr>`;

  const suiteRows = allSuites.length
    ? allSuites
        .map((suite) => {
          const inSuite = specs.filter((s) => s.suiteTags.includes(suite));
          const pass = inSuite.filter((s) => s.outcome === 'pass').length;
          const rate = pct(pass, inSuite.length);
          return `        <tr>
          <td><span class="badge suite-badge">${escapeHtml(suite)}</span></td>
          <td class="tnum">${inSuite.length}</td>
          <td class="tnum">${pass}</td>
          <td><div class="rate"><div class="rate-track"><div class="rate-fill" style="width:${rate}%"></div></div><span class="rate-n tnum">${rate}%</span></div></td>
        </tr>`;
        })
        .join('\n')
    : `        <tr><td colspan="4"><span class="muted">No suite tags found in the latest run.</span></td></tr>`;

  // blocked/uncovered are mutually exclusive; assumed/undocumented is a separate axis.
  const uncovered = rows.filter((r) => r.effective === 'uncovered');
  const blockedRows = rows.filter((r) => r.effective === 'blocked');
  const assumed = rows.filter((r) => r.req.status === 'assumed' || r.req.status === 'undocumented');

  const attnItem = (r: Row, tail: string): string =>
    `<li><a href="${escapeHtml(reqHref(r.req.path))}"><code>${escapeHtml(r.req.id)}</code></a> — ${escapeHtml(
      r.req.title,
    )}${tail}</li>`;

  const attnGroup = (cls: string, icon: string, title: string, items: string[], blurb: string): string =>
    items.length
      ? `    <div class="attn ${cls}">
      <h3>${icon}<span>${escapeHtml(title)}</span> <span class="count tnum">${items.length}</span></h3>
      <p class="muted">${escapeHtml(blurb)}</p>
      <ul>${items.join('')}</ul>
    </div>`
      : '';

  const needsAttention =
    uncovered.length || blockedRows.length || assumed.length
      ? [
          attnGroup(
            'attn-blocked',
            ICONS.block,
            'Blocked',
            blockedRows.map((r) => {
              const failing = r.depStates
                .filter((d) => d.state === 'fail' || d.state === 'blocked' || d.state === 'missing')
                .map((d) => `${d.id} (${RESULT_LABEL[d.state] ?? d.state})`)
                .join(', ');
              return attnItem(r, failing ? ` — dependency ${escapeHtml(failing)}` : '');
            }),
            'A depends_on test is failing; running these would emit a false signal. Fix the dependency first.',
          ),
          attnGroup(
            'attn-uncovered',
            ICONS.gap,
            'Uncovered',
            uncovered.map((r) => attnItem(r, '')),
            'No linked tests yet — author coverage for these requirements.',
          ),
          attnGroup(
            'attn-assumed',
            ICONS.flag,
            'Assumed / undocumented',
            assumed.map((r) => attnItem(r, ` <span class="muted">(status: ${escapeHtml(r.req.status)})</span>`)),
            'Inferred or undocumented status — needs human review and confirmation.',
          ),
        ]
          .filter(Boolean)
          .join('\n')
      : `    <div class="all-clear">${ICONS.check}<span>All requirements covered, unblocked, and confirmed.</span></div>`;

  const suitePills = ['all', ...allSuites]
    .map(
      (s) =>
        `<button class="pill${s === 'all' ? ' active' : ''}" data-suite="${escapeHtml(s)}">${escapeHtml(
          s === 'all' ? 'All suites' : s,
        )}</button>`,
    )
    .join('');

  const reqFilter =
    `<label class="req-filter">Requirement: <select id="req-filter"><option value="all">All requirements</option>` +
    allReqTags.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('') +
    `</select></label>`;

  const NAV: ReadonlyArray<readonly [string, string]> = [
    ['summary', 'Summary'],
    ['last-run', 'Last run'],
    ['requirements', 'Requirements'],
    ['test-cases', 'Test cases'],
    ['suites', 'Suites'],
    ['needs-attention', 'Needs attention'],
  ];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="${theme === 'editorial' ? 'light' : 'dark'}" />
<meta name="theme-color" content="${theme === 'editorial' ? '#f4eddf' : '#050505'}" />
<meta name="description" content="TraceQA Dashboard — the live operations view: latest Playwright run, per-requirement results, suite health, and what needs attention. The formal record lives in the traceability matrix (coverage.html)." />
<link rel="icon" href="${faviconUri(theme)}" />
<title>TraceQA Dashboard — live test status</title>
<style>${themeStyle(theme, 'dashboard')}</style>
</head>
<body>
${backdrop(theme)}

${floatingNav({ items: NAV, health: navHealth, tag: 'Dashboard' })}

  <main>
    <section id="summary" class="hero reveal">
      ${summaryHero}
    </section>

    <section id="last-run" class="reveal">
      <div class="sec-head"><div class="sec-title"><span class="kicker">01</span><h2>Last run</h2></div></div>
      ${lastRun}
    </section>

    <section id="requirements" class="reveal">
      <div class="sec-head">
        <div class="sec-title"><span class="kicker">02</span><h2>Requirements <span class="sec-count tnum">${rows.length}</span></h2></div>
        <div class="filterbar">
          <span class="label">Suite</span>
          ${suitePills}
          <button class="clear-filters" type="button">Clear</button>
        </div>
      </div>
      <div class="shell"><div class="core table-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>Title</th><th>Status</th><th>Linked tests</th><th>Last result</th><th>Dependencies</th></tr>
          </thead>
          <tbody>
${reqRows}
          </tbody>
        </table>
      </div></div>
    </section>

    <section id="test-cases" class="reveal">
      <div class="sec-head">
        <div class="sec-title"><span class="kicker">03</span><h2>Test cases <span class="sec-count tnum">${specs.length}</span></h2></div>
        <div class="filterbar">
          <span class="label">Suite</span>
          ${suitePills}
          ${reqFilter}
          <button class="clear-filters" type="button">Clear</button>
        </div>
      </div>
      <div class="shell"><div class="core table-wrap">
        <table>
          <thead>
            <tr><th>Test</th><th>Covers</th><th>Suites</th><th>Last result</th></tr>
          </thead>
          <tbody>
${tcRows}
          </tbody>
        </table>
      </div></div>
    </section>

    <section id="suites" class="reveal">
      <div class="sec-head"><div class="sec-title"><span class="kicker">04</span><h2>Suites <span class="sec-count tnum">${allSuites.length}</span></h2></div></div>
      <div class="shell"><div class="core table-wrap">
        <table>
          <thead>
            <tr><th>Suite</th><th>Tests</th><th>Passing</th><th>Pass rate</th></tr>
          </thead>
          <tbody>
${suiteRows}
          </tbody>
        </table>
      </div></div>
    </section>

    <section id="needs-attention" class="reveal">
      <div class="sec-head"><div class="sec-title"><span class="kicker">05</span><h2>Needs attention</h2></div></div>
${needsAttention}
    </section>
  </main>

  <footer>
    Generated ${escapeHtml(fmtTimestamp(generatedAt))} by <code>npm run gen:dashboard</code> — deterministic, no AI, no network.<br>
    Source: <code>requirements/index.md</code> + latest <code>test-results/</code>. A derived view — regenerate, never hand-edit.
  </footer>

<script>
(function () {
  var state = { suite: 'all', req: 'all' };

  function inAttr(el, attr, value) {
    if (value === 'all') return true;
    var list = (el.getAttribute(attr) || '').split(' ');
    return list.indexOf(value) !== -1;
  }

  function applyFilters() {
    var reqRows = document.querySelectorAll('#requirements tbody tr');
    for (var i = 0; i < reqRows.length; i++) {
      reqRows[i].classList.toggle('hidden', !inAttr(reqRows[i], 'data-suites', state.suite));
    }
    var tcRows = document.querySelectorAll('#test-cases tbody tr');
    for (var j = 0; j < tcRows.length; j++) {
      var show = inAttr(tcRows[j], 'data-suites', state.suite) && inAttr(tcRows[j], 'data-reqs', state.req);
      tcRows[j].classList.toggle('hidden', !show);
    }
    var pills = document.querySelectorAll('.pill[data-suite]');
    for (var k = 0; k < pills.length; k++) {
      pills[k].classList.toggle('active', pills[k].getAttribute('data-suite') === state.suite);
    }
  }

  var pills = document.querySelectorAll('.pill[data-suite]');
  for (var p = 0; p < pills.length; p++) {
    pills[p].addEventListener('click', function () {
      state.suite = this.getAttribute('data-suite');
      applyFilters();
    });
  }

  var sel = document.getElementById('req-filter');
  if (sel) sel.addEventListener('change', function () { state.req = this.value; applyFilters(); });

  var clears = document.querySelectorAll('.clear-filters');
  for (var c = 0; c < clears.length; c++) {
    clears[c].addEventListener('click', function () {
      state.suite = 'all';
      state.req = 'all';
      if (sel) sel.value = 'all';
      applyFilters();
    });
  }

  applyFilters();
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
  const byId = new Map(reqs.map((r) => [r.id, r] as const));
  const latest = await findLatestRun();
  const specs = latest ? flattenSpecs(latest.json) : [];
  const rows = build(reqs, specs);
  const stats = latest?.json?.stats ?? null;
  const suiteFilterUsed = latest ? parseSuiteFilter(latest.json?.config?.argv) : null;
  const theme = resolveTheme();

  const html = render({
    rows,
    specs,
    byId,
    run: latest?.run ?? null,
    stats,
    suiteFilterUsed,
    generatedAt: new Date().toISOString(),
    theme,
  });

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
