---
id: FR-AUTH-001
title: User can log in with email and password
status: documented
depends_on: []
linked_tests: [tests/auth/login.spec.ts]
source: null
---

## Acceptance criteria

- **Given** a registered user on the login page
  **When** they submit a valid email and password
  **Then** they land on the dashboard showing their name

- **Given** a registered user on the login page
  **When** they submit an incorrect password
  **Then** they stay on the login page and see an "Invalid email or password" error
