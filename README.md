# AI QA Pipeline — Template

An AI-authored, **plain-Playwright-run** end-to-end QA pipeline. It generates and
maintains an automated test suite from functional requirements and produces an
HTML coverage + traceability report.

> Read [`DESIGN.md`](DESIGN.md) for the full reasoning. This README is the
> operator's guide. This repo is a **template** — a runnable skeleton with the
> conventions in place, not a full implementation of every flow.

## Core principle (do not violate)

**AI is spent only when something is created or has broken — never on the happy
path.** Plain Playwright runs the suite; the model only authors tests, discovers
and maintains the page map, and analyzes failures.

| Phase | AI? |
|---|---|
| Authoring (per requirement / flow) | Yes — once |
| Discovery / map updates | Yes — once per page, plus on drift repair |
| **Execution** | **No — plain Playwright, every commit** |
| Failure analysis | Yes — only when something fails |

There is **no LLM call in the test run loop**, and nothing in this repo builds
one. The deterministic scripts (`scripts/`) contain no AI either.

## Quickstart

```bash
npm install          # also downloads Playwright chromium (postinstall)
npm test             # runs the seed suite against the bundled demo app
npm run gen:index    # requirements/*  →  requirements/index.md  (metadata-only)
npm run gen:report   # index + latest results  →  reports/coverage.html
open reports/coverage.html   # the deliverable (use `start` on Windows)
```

`npm install && npm test` works offline: the tests run against a tiny bundled
demo app in [`demo-app/`](demo-app/), started automatically by Playwright's
`webServer`. Point at your real app by setting `BASE_URL` (and replacing the
`webServer` block in `playwright.config.ts`).

## Folder structure

```
requirements/        Canonical requirements, one file per requirement
  auth/FR-AUTH-001.md   seed: user login
  orders/FR-ORD-001.md  seed: create order (depends_on FR-AUTH-001) — uncovered
  index.md              GENERATED, metadata-only — never hand-edit
steps/               The page/action map (semantic name → selector + confidence)
  login.json            seed map entry
tests/               Playwright specs (Mode A — no AI at run time)
  auth/login.spec.ts    seed test: tag convention + selector ladder
test-results/        Timestamped Playwright output (gitignored)
reports/coverage.html GENERATED traceability matrix (gitignored)
sources/             Original imported docs (CSV/PDF/Word), linked via `source`
demo-app/            Bundled example target app so the template runs offline
skills/              The four AI skills (canonical, source of truth)
.claude/skills/      Committed mirror so Claude Code auto-loads them (see below)
scripts/             Deterministic generators (no AI)
  generate-index.ts     frontmatter → index.md
  generate-report.ts    index + results → coverage.html
  sync-skills.ts        skills/ → .claude/skills/
playwright.config.ts  HTML + JSON reporters, timestamped into test-results/
```

## The four skills

AI behavior is encoded as skills, not a runtime engine. Each lives in
`skills/<name>/SKILL.md`.

1. **`requirements-authoring`** — normalize any source (folder, plain English,
   CSV, PDF, Word, repo) into canonical per-requirement files. Resolves ambiguity
   by **interactive vs. batch**: interactive → ask, resolve to `documented`;
   batch → write best guess as `assumed` and return the list for review. Keeps the
   original linked via `source`. Runs `gen:index` after.
2. **`site-discovery`** — maintain `steps/`. Cache with discovery-fallback: check
   `steps/` first; treat user-supplied steps as hints reconciled against
   discovery; explore the live site only when needed; persist only verified
   selectors, recorded with the selector ladder + confidence.
3. **`test-authoring`** — requirement + `depends_on` (loaded **selectively**) +
   steps map → a deterministic Playwright spec. Tags on two axes. Handles
   dependencies by type (sequencing → setup; definitional/undocumented → STOP for
   a human stub). Updates `linked_tests`, runs `gen:index`.
4. **`failure-analysis`** — read the latest run, classify each failure (product
   bug / selector drift / flake). Proposes a steps-map + selector repair on
   drift — **behind a human approval gate**. Never heals a failing `data-testid`
   selector (likely a real bug).

## Requirement schema

One file per requirement; YAML frontmatter — **these fields, no more, no less**:

```yaml
---
id: FR-AUTH-001
title: User can log in with email and password
status: documented        # documented | assumed | undocumented
depends_on: []             # list of requirement IDs
linked_tests: []           # list of spec paths (repo-relative)
source: null               # path under sources/ if imported, else null
---
```

Body = acceptance criteria in **Given / When / Then**.

## The token map — what actually saves tokens

> **Selective loading is the saver — not the file split.** Authoring or
> regenerating a test loads **only the target requirement + its `depends_on`**,
> never the whole folder.

The flow:

1. **Read `requirements/index.md` first** — metadata-only (`id`, `title`,
   `status`, `depends_on`, `linked_tests`, `path`). It's the orientation layer
   and the dependency graph in one cheap read.
2. From the index, **load only the files you need** — the target requirement and
   the requirements it depends on.

Why the index is metadata-only: concatenating bodies would duplicate the whole
corpus, drift the moment one copy is edited, and reload everything on every read.
The index is **generated** from frontmatter and **never hand-maintained**.

## Selector ladder

`data-testid` (**high**) → accessible: role + visible name / label association
(**medium**) → structural / CSS (**low — flagged**). Structural matches are
recorded as low-confidence so they can be hardened. A failing `data-testid` is
treated as a likely **product bug**, not something to heal away.

## Tagging — two axes

Every test carries both:

```ts
test('…', { tag: ['@FR-AUTH-001', '@smoke', '@sprint10'] }, async ({ page }) => { … });
```

- **Requirement axis** — `@FR-AUTH-001`
- **Suite axis** — `@smoke`, `@sprint10`

Rerun by either with `--grep`:

```bash
npx playwright test --grep @FR-AUTH-001   # one requirement
npm run test:smoke                         # = playwright test --grep @smoke
```

## npm scripts

| Script | Does |
|---|---|
| `npm test` | Run the suite (plain Playwright) |
| `npm run test:smoke` | Run the `@smoke` suite (`--grep @smoke`) |
| `npm run gen:index` | Regenerate `requirements/index.md` from frontmatter |
| `npm run gen:report` | Regenerate `reports/coverage.html` from index + latest results |
| `npm run sync:skills` | Mirror `skills/` → `.claude/skills/` |

The runner (`tsx`, `playwright`) is an implementation detail behind these aliases.

## Deterministic pipeline

```
requirement/*.md ──(gen:index, no AI)──▶ requirements/index.md ─┐
                                                                ├─(gen:report, no AI)─▶ reports/coverage.html
test-results/<latest>/results.json ─────────────────────────────┘
```

The coverage report shows, per requirement: status, linked tests, pass/fail,
coverage gaps, and **blocked** state (a dependency's test failed → dependents are
blocked rather than reported as independent failures). Groupable by requirement
and by suite.

## Guardrails (non-negotiable)

- **No AI in the run loop.** Execution is plain Playwright.
- **Selective loading** — target requirement + `depends_on` only, never the
  whole folder.
- **Approval gate on any test edit**, even when classification is automated.
- **Undocumented / definitional dependency → STOP** and require a human-written
  stub. Never auto-stub.
- **Selector ladder**, with structural matches flagged low-confidence.
- **Master index is metadata-only** — never concatenate requirement bodies.
- **`status: assumed`** marks both batch-authoring guesses and surfaced
  undocumented dependencies.
- **Generated files are never hand-edited** (`requirements/index.md`,
  `reports/coverage.html`).

## Build order (from `DESIGN.md`) — and what's in this template

Each stage is independently demoable.

1. **Scenario-2 incremental engine** — requirement → test → coverage on a known
   app, HTML report rendering. ✅ **scaffolded here** (seed requirement, seed
   test, both generators, the report).
2. **Steps map** — the cost optimization. ✅ schema + seed entry + skill.
3. **Self-healing** — failure-triggered map repair behind the approval gate.
   📄 documented in `failure-analysis` (not pre-built).
4. **Website extraction** *(stretch)* — derive UI surface + **characterization
   tests** (change-detectors, labeled as such — not requirements). 📄 documented,
   not pre-built.

**Out of scope for this template (left as documented skill behavior):** live
discovery runs, self-healing execution, and website extraction.

## Skills location & Claude Code auto-loading

`skills/` is the **source of truth**. Claude Code auto-loads project skills from
`.claude/skills/<name>/SKILL.md` (confirmed against the Claude Code docs), so a
committed mirror lives there too. After editing any `skills/**/SKILL.md`, re-sync:

```bash
npm run sync:skills
```

## Wiring to a real app

1. Set `BASE_URL` (env) to your app, and replace/remove the `webServer` block in
   `playwright.config.ts`.
2. Use `requirements-authoring` to import or write requirements.
3. Use `site-discovery` to map flows into `steps/`.
4. Use `test-authoring` to write specs; `npm test`; `npm run gen:report`.
5. On red runs, use `failure-analysis`.

## Notes on stack choices

Node + TypeScript, Playwright, `gray-matter` (frontmatter), `tsx` (run the TS
scripts), plain static HTML for the report — as specified in the bootstrap. Two
additions worth flagging: a **`postinstall` step downloads Playwright chromium**
so `npm install && npm test` works in one go (run `npx playwright install
chromium` manually if you're behind a proxy), and a **bundled `demo-app/`** is
the example target app so the seed test passes offline. `linked_tests` stores
**repo-relative** spec paths (e.g. `tests/auth/login.spec.ts`) for unambiguous
correlation in the report.
