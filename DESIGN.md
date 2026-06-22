# AI QA Pipeline — Design

**One engine, two maturity levels.** Generates and maintains an automated end-to-end test suite from functional requirements — whether the project already has a full requirements doc (mature / sprint-based) or is greenfield and growing one requirement at a time. The same *requirement → test → coverage* loop runs underneath both; the only difference is whether requirements arrive in bulk or one at a time.

## Operating principle

AI is spent only when something is **created or has broken** — never on the happy path. Plain Playwright runs the suite; the model authors tests, discovers and maintains the page map, and analyzes failures.

| Phase | AI? |
|---|---|
| Authoring (per requirement / flow) | Yes — once |
| Discovery / map updates | Yes — once per page, plus on drift repair |
| Execution | No — plain Playwright, every commit |
| Failure analysis | Yes — only when something fails |

## Locked decisions

1. **Execution model** — AI authors and repairs; plain Playwright runs. No AI in the run loop by default. Optional AI-driven execution (Mode B) exists only as a scalpel for dynamic / exploratory flows.
2. **Source ingestion** — normalize any source (CSV, PDF, Word, repo) into canonical per-requirement Markdown files; keep the original linked, since PDF/Word extraction is lossy.
3. **Requirement schema** — `id`, `title`, acceptance criteria (Given/When/Then), `status`, `depends_on`, `linked_tests`.
4. **Steps / map layer** — a cache with discovery-fallback. Need an action → check steps → use if present, else discover live and persist. User-provided steps are hints, verified by discovery before they are stored. Maintained from two triggers: new-flow authoring and failure repair.
5. **Failure handling** — three modes: analyze-only (tests already ran, AI classifies a saved report), human-classifies, and AI-runs-and-classifies (Mode B). Classification may be automated; **acting on it — editing a test — always keeps a human approval gate.**
6. **Undocumented dependency** — stop and make the human write the stub. No silent auto-stubbing.
7. **Selectors** — fallback ladder: `data-testid` → accessible (role + text, label association) → structural / CSS. Structural matches are flagged low-confidence.
8. **Deliverable** — an HTML coverage + traceability report, groupable by requirement and by suite.
9. **Tagging** — two independent axes per test: requirement ID(s) and suite membership. Both filtered with Playwright `--grep`.

## Requirement file

One file per requirement. Markdown with YAML frontmatter:

```markdown
---
id: FR-AUTH-001
title: User can log in with email and password
status: documented        # documented | assumed | undocumented
depends_on: []
linked_tests: [auth/login.spec.ts]
---

## Acceptance criteria

- **Given** a registered user on the login page
  **When** they submit a valid email and password
  **Then** they land on the dashboard showing their name
```

`status` does double duty: it marks AI-guessed-but-unconfirmed requirements (from batch authoring) and undocumented dependencies surfaced during test generation.

## Folder layout

```
requirements/
  auth/    FR-AUTH-001.md  FR-AUTH-002.md
  orders/  FR-ORD-001.md
  index.md   (generated)
```

Folders are the readable "feature block." The atomic unit stays one requirement per file, so loading stays granular and the `depends_on` graph works at the ID level.

## Master index

Generated, **metadata-only** — never a concatenation of bodies. A concatenation would duplicate every requirement, drift the moment one copy is edited, and reload the whole corpus every time the AI reads it to orient. The index holds frontmatter only: `id`, `title`, `status`, `depends_on`, `linked_tests`, `path`. It is read *first* to decide which files to load, and doubles as the dependency graph and the backbone of the coverage report. A script regenerates it from each file's frontmatter; it is never hand-maintained.

**Selective loading is what saves tokens — not the split itself.** Authoring or regenerating a test loads only the target file plus its `depends_on`, never the whole folder.

## Authoring

Two intake paths — point at a folder, or write plain English — both pass through one gate: resolve ambiguity, then write canonical files. Ambiguity handling keys off interactive vs. batch, not source format:

- **Interactive** (one at a time): ask the user, resolve to `documented`.
- **Batch** (many at once): don't block; write the best guess as `assumed`, then return the list of assumed items for review.

## Dependencies

`depends_on` makes requirements a DAG. That buys: build and run in topological order; if a dependency's test fails, mark dependents **blocked** rather than running them (their failure would be a false signal); when a parent and child are both red, the graph shows the child is downstream so it isn't reported as an independent bug; and coverage can honestly report "A1 tested, depends on A2 (undocumented)" instead of misleading green.

Two dependency types, kept distinct:

- **Sequencing** (A1 needs A2 to have *happened*) — a setup problem. Solve with real-but-unasserted setup, injected state (`storageState`, API / DB seed), or network mocks. No A2 spec required.
- **Definitional** (A1's *correctness is defined by* A2) — a missing-spec problem. No mock fixes this; mocking only hides the unspecified value inside test code. A one-line `assumed` stub makes the assumption visible and reviewable instead.

## Execution modes

- **Mode A — plain Playwright.** Default. Fast, free, runs on every commit. This is the suite.
- **Mode B — AI-driven execution.** Opt-in scalpel for flows too dynamic to pin to selectors, or a quick exploratory pass on something new. Costs tokens every run; not the regression suite.

## Coverage & traceability report

The product. An HTML Requirements Traceability Matrix: which requirements have tests, which pass or fail, which are uncovered, plus dependency / blocked state. Groupable by requirement and by suite. Generated from the index plus the latest Playwright results.

## Build order

Each stage is independently demoable.

1. **Scenario-2 incremental engine** — prove requirement → test → coverage end to end on a small, known app; get the HTML report rendering.
2. **Steps map** — the cost optimization.
3. **Self-healing** — failure-triggered map repair, behind the approval gate.
4. **Website extraction** *(stretch)* — derive the UI surface and characterization tests from a live site. Label the output honestly as characterization tests (change-detectors), not requirements.
