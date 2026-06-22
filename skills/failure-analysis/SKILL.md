---
name: failure-analysis
description: >
  Triage a failed Playwright run. Read the latest timestamped report under
  test-results/ and classify each failure as product bug, selector drift, or
  flake. Use after a run goes red, or to analyze a saved report. Proposes a
  steps-map + selector repair on drift, but every test edit is held behind a
  human approval gate — and a failing high-confidence (data-testid) selector is
  flagged as a likely real bug, never silently healed.
---

# Failure analysis

AI runs here **only when something has broken** — never on the happy path. Plain
Playwright already ran the suite; you are classifying what it produced.

## Input

The latest timestamped run under `test-results/<timestamp>/`:
- `results.json` — machine-readable outcomes (the same file `gen:report` reads).
- `html-report/` — human report.
- `artifacts/` — traces, screenshots, videos for failed tests.

Pick the lexicographically-greatest timestamp folder (ISO timestamps sort
chronologically).

## Three modes

- **Analyze-only** — tests already ran; you classify the saved report. (Default,
  and the only mode wired in this template.)
- **Human-classifies** — a person triages; you assist with evidence.
- **AI-runs-and-classifies (Mode B)** — opt-in scalpel: AI drives the run and
  classifies live. Costs tokens every run; **not** the regression suite. *Out of
  scope for this template — documented as behavior.*

## Classify each failure

| Class | Signal | Action |
|---|---|---|
| **Product bug** | Assertion failed on correct, resolvable selectors; or a **`data-testid` selector no longer resolves** (the app removed/renamed a contract element). | Report it. Do **not** "repair" the test. |
| **Selector drift** | A `medium`/`low`-confidence selector (accessible text changed, structural path moved) no longer resolves, but the feature still works. | Propose a steps-map + selector repair — **gated** (below). |
| **Flake** | Passes on retry; timing/network nondeterminism; no stable reproduction. | Stabilize (better wait/assertion), quarantine, or re-run. Don't edit logic. |

Attach evidence to every classification: the error, the failing selector and its
recorded confidence, and the trace/screenshot path.

## On drift → propose, don't apply

When you classify drift, propose **both** a `steps/<flow>.json` update (via
[[site-discovery]], re-verified on the live site) **and** the minimal test edit.
Present them as a diff.

> **Approval gate (non-negotiable):** *any* test edit is held behind explicit
> human approval, even when classification is automated. Classification may be
> automatic; **acting on it is not.** Show the diff; wait for approval; then apply.

## High-confidence selector guardrail (non-negotiable)

**Never heal away a failure on a high-confidence (`data-testid`) selector.** A
`data-testid` that no longer matches almost always means the product changed or
removed a contract element — that is a **likely real bug**. Flag it as a product
bug; do not patch the selector to make red turn green.

## Use the dependency graph

Cross-reference `requirements/index.md` `depends_on`:
- If a failure is in a **dependency**, its dependents are **blocked**, not
  independently failing — don't report the child as a separate bug.
- When a parent and child are both red, the graph shows the child is downstream.

## After an approved repair

1. Update `steps/` with the re-verified selector (`verified: true`).
2. Re-run: `npm test`.
3. Regenerate the report: `npm run gen:report`.

> Self-healing execution (auto-applying repairs) is **out of scope for this
> template** — the approval gate stays.
