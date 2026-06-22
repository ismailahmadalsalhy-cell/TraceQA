# sources/

Original imported documents (CSV, PDF, Word, exported repos, screenshots of a
spec, …) live here, untouched. PDF/Word extraction is lossy, so the original is
always kept and linked.

Each canonical requirement file links back to its origin via the `source`
frontmatter field — a path under this folder, e.g.:

```yaml
source: sources/2026-Q2-requirements.pdf
```

`source: null` means the requirement was authored directly (plain English /
interactive), not imported. The `requirements-authoring` skill writes these
files and sets `source`.
