---
name: requirements-authoring
description: >
  Convert any source — a folder of docs, plain English, CSV, PDF, Word, or a
  repo — into canonical per-requirement Markdown files (one requirement per
  file, YAML frontmatter + Given/When/Then). Use when importing or writing
  requirements, normalizing a spec, or adding/refining a single requirement.
  Resolves ambiguity by interactive-vs-batch, keeps the original linked, then
  regenerates the index.
---

# Requirements authoring

AI runs here at **authoring time only**. You are normalizing messy intent into
canonical requirement files. You never run tests and never call an LLM at run
time.

## The canonical file

One requirement per file under `requirements/<area>/<ID>.md`. Folders are the
readable "feature block"; the atomic unit stays one requirement per file so
loading is granular and the `depends_on` graph works at the ID level.

Frontmatter — **exactly these fields, no more, no less**:

```yaml
---
id: FR-AUTH-001            # FR-<AREA>-NNN, unique
title: <one line>
status: documented         # documented | assumed | undocumented
depends_on: []             # list of requirement IDs
linked_tests: []           # list of spec paths (repo-relative)
source: null               # path under sources/ if imported, else null
---
```

Body = acceptance criteria as **Given / When / Then** bullets. Be concrete and
testable; one scenario per bullet.

## The one gate: resolve ambiguity, then write

Both intake paths — point at a folder, or write plain English — pass through the
same gate. **Ambiguity handling keys off interactive vs. batch, not source
format:**

- **Interactive (one at a time):** ask the user to resolve the ambiguity, then
  write the file as `status: documented`. **Never silently invent acceptance
  criteria in interactive mode** — if you don't know, ask.
- **Batch (many at once):** don't block. Write your best guess as
  `status: assumed`, and at the end **return the list of assumed items** so the
  human can review them. Surfacing the guess as `assumed` is the point — it
  makes the assumption visible instead of hiding it as fact.

## Keep the original linked

PDF / Word / CSV extraction is lossy. Copy the original into `sources/` and set
`source:` to that path (e.g. `source: sources/2026-Q2-spec.pdf`). Authored-
directly requirements use `source: null`.

## status semantics

`status` does double duty:
- `assumed` — an AI guess from batch authoring that a human hasn't confirmed
  (here), **and** an undocumented dependency surfaced during test authoring
  (see [[test-authoring]]).
- `undocumented` — known to be unspecified; correctness can't be asserted yet.
- `documented` — confirmed against a source or a human.

## Guardrails (non-negotiable)

- **Selective loading.** When refining one requirement, read `requirements/index.md`
  first, then load **only that requirement file plus its `depends_on`** — never
  the whole folder. The split alone saves nothing; selective loading is what
  saves tokens.
- **Never hand-edit `requirements/index.md`.** It is generated.
- **Never concatenate requirement bodies** anywhere — the index is metadata-only.
- **Never invent acceptance criteria interactively.** Ask.

## After writing

Always run:

```bash
npm run gen:index
```

This regenerates `requirements/index.md` from frontmatter. Then hand off to
[[test-authoring]] to author the Playwright spec, and to [[site-discovery]] if a
new flow's selectors aren't mapped yet.
