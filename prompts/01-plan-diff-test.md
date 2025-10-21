---
name: Plan → Diff → Test
description: Generate a small plan, then minimal diffs, and test updates.
invokable: true
---

# Plan → Diff → Test

**When invoked:**
1. Propose a short, numbered *plan* (1–6 steps max).
2. List the files you will touch.
3. Output *only* unified diffs with correct repo-relative paths. Keep patches minimal and focused.
4. If behavior changes, include new/updated tests in the diff.
5. End with a one-line commit message suggestion.

**Context to consider (if available):** @repo-map, @diff, @open, @file, @code.
