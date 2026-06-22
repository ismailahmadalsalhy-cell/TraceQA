# steps/ — the page / action map

A cache with discovery-fallback. One JSON file per flow (e.g. `login.json`). When
a test needs an action, the `site-discovery` skill checks here first and uses the
recorded entry if present; otherwise it discovers the flow on the live site and
persists the result here. User-supplied steps are treated as **hints** and
reconciled against discovery before being stored — never trusted blindly.

This folder is maintained from two triggers: **new-flow authoring** and
**failure repair** (selector-drift fixes, behind the human approval gate).

## Entry schema (see `login.json`)

```jsonc
{
  "flow": "login",                 // stable flow name
  "url": "/login.html",            // entry URL (relative to baseURL)
  "description": "…",
  "discovered_at": "YYYY-MM-DD",
  "verified": true,                 // false until discovery confirms it on the live site
  "elements": {
    "<semantic name>": {
      "selector": "getByTestId('…')",      // Playwright locator expression
      "strategy": "data-testid | accessible | structural",
      "confidence": "high | medium | low"  // structural ⇒ low, and is flagged
    }
  },
  "steps": [                        // ordered actions, referencing element names
    { "action": "fill", "target": "email field", "value": "<email>" }
  ]
}
```

`confidence` mirrors the selector ladder: `data-testid` → **high**, accessible
(role + name / label) → **medium**, structural / CSS → **low** (flagged for an
author to harden).
