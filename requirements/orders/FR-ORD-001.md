---
id: FR-ORD-001
title: Authenticated user can create a sales order
status: documented
depends_on: [FR-AUTH-001]
linked_tests: []
source: null
---

## Acceptance criteria

- **Given** a logged-in user on the new-order page
  **When** they add a product, set a quantity, and submit the order
  **Then** the order is created and appears in their order history with a confirmation number

<!--
  This requirement is intentionally UNCOVERED (linked_tests: []) so the coverage
  report shows a real gap, and it `depends_on: [FR-AUTH-001]` to demonstrate the
  dependency graph:

    - The dependency is SEQUENCING (an order needs a login to have *happened*),
      not definitional. When test-authoring writes the order spec, it should
      satisfy this with setup (storageState / API seed / unasserted login steps) —
      NOT by authoring a second login test, and NOT by auto-stubbing.

    - In the report, FR-ORD-001 will show as documented + uncovered. If FR-AUTH-001's
      test were red, FR-ORD-001 would be marked BLOCKED rather than run, because its
      failure would be a false signal.
-->
