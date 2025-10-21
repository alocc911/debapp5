---
name: Write/Update Tests
description: Create or update tests for recent changes; cover edge cases.
invokable: true
---

# Test Authoring

Given the current code and recent diffs, write or update tests that:
- Assert the intended behavior, including edge cases and error paths.
- Use the project's existing test framework and conventions.
- Keep tests deterministic (no sleeps or network if possible).
- Prefer small, focused tests over large integration tests unless explicitly requested.

Output only the minimal diffs to add/modify tests.
