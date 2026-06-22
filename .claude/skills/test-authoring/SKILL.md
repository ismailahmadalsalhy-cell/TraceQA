---
name: test-authoring
description: >
  Author a deterministic Playwright spec for a requirement, using its
  depends_on (loaded selectively) and the steps/ map. Use when turning a
  requirement into a test. Applies the selector ladder, tags on two axes
  (requirement ID + suite), handles dependencies by type (sequencing via setup;
  definitional/undocumented → STOP for a human stub, never auto-stub), links the
  test back, and regenerates the index.
---

# Test authoring

AI runs here at **authoring time only**. The spec you write is **plain
Playwright (Mode A)** — it must run with **no AI in the loop**, fast and free,
on every commit.

## Selective loading (the token-saver)

1. Read `requirements/index.md` first (metadata + the dependency graph).
2. Load **only the target requirement file plus its `depends_on`** — never the
   whole folder.
3. Load the relevant `steps/<flow>.json`. If the action isn't mapped, invoke
   [[site-discovery]] to map it first.

## Write a deterministic spec

- Selectors come from the steps map and follow the **selector ladder**:
  `data-testid` → accessible (role + name / label) → structural / CSS (flagged).
- Use **web-first assertions** (`await expect(locator).…`) that auto-wait. No
  arbitrary `waitForTimeout`, no AI calls, no unseeded randomness.
- Keep tests independent and idempotent.

## Tagging — two independent axes

Tag **every** test on both axes so `--grep` can rerun by either:

```ts
test('…', { tag: ['@FR-AUTH-001', '@smoke', '@sprint10'] }, async ({ page }) => { … });
```

- **Requirement axis:** `@FR-AUTH-001` (one per requirement the test covers).
- **Suite axis:** `@smoke`, `@sprint10`, … (membership for slicing runs).

`npm run test:smoke` is `playwright test --grep @smoke`; `--grep @FR-AUTH-001`
reruns one requirement.

## Dependencies — handle by type

Read `depends_on` from the requirement. Classify each dependency:

- **Sequencing** (A needs B to have *happened* — e.g. an order needs a login):
  a **setup** problem. Solve with real-but-unasserted setup — `storageState`,
  an API / DB seed, or unasserted UI steps — or a network mock. **Do not author
  a second test for B**, and do not assert B here.
- **Definitional** (A's *correctness is defined by* B) **or undocumented**: a
  missing-spec problem. **STOP.** A mock can't fix this — it would bury the
  unspecified value inside test code. Require a **human-written stub**: create
  (or ask requirements-authoring to create) a one-line `status: assumed` (or
  `undocumented`) requirement that makes the assumption visible and reviewable.
  **Never auto-stub.**

## After writing

1. Update the requirement's `linked_tests` to include the new spec
   (repo-relative path, e.g. `tests/auth/login.spec.ts`).
2. Run `npm run gen:index`.
3. Optionally `npm test` then `npm run gen:report` to see coverage update.

## Guardrails (non-negotiable)

- **No AI at run time** — the spec is pure Playwright.
- **Selective loading only** — target + `depends_on`, never the whole folder.
- **Never auto-stub an undocumented/definitional dependency** — STOP for a human.
- **Editing an existing test** (vs. writing a new one) goes through the human
  **approval gate** — see [[failure-analysis]].
- Apply the **selector ladder**; flag any structural selector as low-confidence.
