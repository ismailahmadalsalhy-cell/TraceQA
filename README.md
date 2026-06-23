# AI QA Pipeline — Template

AI-authored, **plain-Playwright-run** end-to-end testing. Turns functional
requirements into a maintained test suite and an HTML coverage + traceability
report. A runnable skeleton with the conventions in place — see
[`DESIGN.md`](DESIGN.md) for the reasoning.

## Core principle

**AI is spent only when something is created or breaks — never on the happy
path.** Plain Playwright runs the suite; the model only authors tests, maintains
the page map, and analyzes failures. No LLM call lives in the run loop or in
`scripts/`.

| Phase | AI? |
|---|---|
| Authoring · discovery · failure analysis | Yes — once, on demand |
| **Execution** (every commit) | **No — plain Playwright** |

## Quickstart

```bash
npm install        # also fetches Playwright chromium
npm test           # seed suite vs. the bundled demo app (runs offline)
npm run gen:index  # requirements/  →  requirements/index.md
npm run gen:report # index + latest results  →  reports/coverage.html
```

Point at your own app: set `BASE_URL` and replace the `webServer` block in
[`playwright.config.ts`](playwright.config.ts).

## Layout

```
requirements/  one .md per requirement (+ GENERATED index.md, metadata-only)
steps/         page/action map: semantic name → selector + confidence
tests/         Playwright specs (no AI at run time)
sources/       original imported docs, linked via `source`
skills/        the 4 AI skills — source of truth; mirrored to .claude/skills/
scripts/       deterministic generators (no AI)
demo-app/      bundled target app so the template runs offline
reports/ test-results/   GENERATED, gitignored
```

## The four skills

AI behavior is encoded in `skills/<name>/SKILL.md`, not in a runtime engine.

| Skill | Does |
|---|---|
| **requirements-authoring** | Normalize any source (folder, text, CSV, PDF, Word, repo) → canonical requirement files. Interactive → ask, mark `documented`; batch → best guess as `assumed`, return the list for review. |
| **site-discovery** | Maintain `steps/`. Check the cache first; treat user-supplied steps as hints reconciled against discovery; persist only verified selectors. |
| **test-authoring** | Requirement + `depends_on` (loaded selectively) + steps map → a deterministic spec. Tags on two axes. Deps: sequencing → setup; definitional/undocumented → STOP for a human stub. |
| **failure-analysis** | Classify each failure (product bug / selector drift / flake). Drift → propose a repair behind a human approval gate. Never heals a failing `data-testid`. |

## Requirement schema

```yaml
---
id: FR-AUTH-001
title: User can log in with email and password
status: documented        # documented | assumed | undocumented
depends_on: []             # requirement IDs
linked_tests: []           # repo-relative spec paths
source: null               # path under sources/ if imported, else null
---
```

Body = acceptance criteria in **Given / When / Then**.

## Conventions

- **Selective loading (the token saver).** Read `index.md` first — metadata +
  dependency graph in one cheap read — then load only the target requirement and
  its `depends_on`, never the whole folder. The index is generated and
  metadata-only; never hand-edit it or concatenate bodies into it.
- **Selector ladder.** `data-testid` (high) → role + name / label (medium) →
  CSS / structural (low, flagged). A failing `data-testid` is a likely product
  bug, not something to heal away.
- **Two tagging axes.** `{ tag: ['@FR-AUTH-001', '@smoke', '@sprint10'] }` — rerun
  by requirement (`--grep @FR-AUTH-001`) or by suite (`--grep @smoke`).

## Scripts

| Script | Does |
|---|---|
| `npm test` · `npm run test:smoke` | Run all · `@smoke` only |
| `npm run gen:index` | requirements → `index.md` (metadata-only) |
| `npm run gen:report` | index + latest run → `coverage.html` |
| `npm run sync:skills` | mirror `skills/` → `.claude/skills/` (re-run after editing a skill) |

**Pipeline** (all deterministic, no AI):
`requirements/*.md → index.md`, then `index.md` + `test-results/<latest>/results.json → coverage.html`.
The report shows per requirement: status, linked tests, pass/fail, coverage gaps,
and **blocked** state — a dependency's test failed, so dependents are marked
blocked instead of reported as independent failures. Groupable by requirement and
by suite.

## Guardrails (non-negotiable)

- No AI in the run loop · selective loading only · **approval gate on every test edit**.
- Undocumented / definitional dependency → **STOP** for a human stub; never auto-stub.
- Index is metadata-only; generated files (`index.md`, `coverage.html`) are never hand-edited.
- `status: assumed` marks both batch-authoring guesses and surfaced undocumented dependencies.

## Scope

Built here (build order from `DESIGN.md`): the incremental
requirement → test → coverage engine, the steps map, two-axis tagging, and the
HTML report. **Documented as skill behavior but not pre-built:** live discovery
runs, self-healing execution, and website extraction (which yields
*characterization tests*, labeled as such — not requirements).

## Notes

Stack: Node + TypeScript, Playwright, `gray-matter`, `tsx`, static HTML — per the
bootstrap. Additions: a `postinstall` fetches chromium so `npm install && npm test`
works in one step (run `npx playwright install chromium` manually behind a proxy);
`demo-app/` is the offline example target; `.claude/skills/` is a committed mirror
(path confirmed against the Claude Code docs).
