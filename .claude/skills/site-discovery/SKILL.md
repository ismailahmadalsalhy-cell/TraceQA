---
name: site-discovery
description: >
  Maintain the steps/ page-and-action map — semantic element names → Playwright
  selectors, recorded with the selector ladder. Use when a test needs an action
  (e.g. "log in", "create sales order") and you must resolve elements to
  selectors. A cache with discovery-fallback: check steps/ first, reconcile any
  user-supplied steps against the live site, persist only verified selectors.
---

# Site discovery (the steps map)

AI runs here at **discovery / map-maintenance time only** — once per page, plus
on drift repair. The map it produces is consumed by plain Playwright at run time
with no AI involved.

## Algorithm — cache with discovery-fallback

When an action is needed:

1. **Check `steps/` first.** If a recorded entry for the flow exists, use it.
2. **User-supplied steps are hints, not truth.** If the user handed you steps or
   selectors, treat them as a starting point and **reconcile them against
   discovery** before relying on them — do not trust them blindly.
3. **Explore the live site only when needed** — when the flow is unmapped or a
   recorded selector no longer resolves.
4. **Persist to `steps/` only after discovery completes** and the selector is
   verified to resolve on the live page. Set `verified: true` only then.

> Live discovery runs are **out of scope for this template** — documented here
> as behavior, not pre-built. When wired up, discovery drives a real browser,
> reads the DOM/accessibility tree, and records selectors.

## The selector ladder — always prefer the top rung

| Rung | Strategy | Example | Confidence |
|---|---|---|---|
| 1 | `data-testid` | `getByTestId('login-email')` | **high** |
| 2 | accessible: role + visible name, or label association | `getByRole('button', { name: 'Sign in' })`, `getByLabel('Email')` | **medium** |
| 3 | structural / CSS | `locator('form > p:nth-child(2) input')` | **low — FLAGGED** |

Record the rung you used. **Structural matches are low-confidence and must be
flagged** so an author can push the app team to add a `data-testid`.

## Entry schema (`steps/<flow>.json`)

```jsonc
{
  "flow": "login",
  "url": "/login.html",
  "description": "…",
  "discovered_at": "YYYY-MM-DD",
  "verified": true,
  "elements": {
    "<semantic name>": {
      "selector": "getByTestId('…')",
      "strategy": "data-testid | accessible | structural",
      "confidence": "high | medium | low"
    }
  },
  "steps": [ { "action": "fill", "target": "email field", "value": "<email>" } ]
}
```

See `steps/login.json` for the worked example.

## Two triggers maintain the map

- **New-flow authoring** — [[test-authoring]] needs an action that isn't mapped.
- **Failure repair** — [[failure-analysis]] classified a failure as selector
  drift and proposes a map update. That update is applied **behind the human
  approval gate**, and only verified selectors are written back.

## Guardrails (non-negotiable)

- Never persist an unverified selector as `verified: true`.
- Never silently downgrade to a structural selector without flagging it `low`.
- The map is a cache, not a spec — discovery is the source of truth when they
  disagree.
