---
name: Project Guardrails
alwaysApply: true
description: Enforce a plan → diff → test workflow; keep API stability and type-safety.
---

# House Rules
- **Workflow:** For any change request, first propose a numbered plan, then output *minimal unified diffs* (`diff --unified`) with correct file paths relative to the repo root. Prefer diffs over prose.
- **Multi-file edits:** List all affected files up front. Apply changes incrementally and keep patch chunks small and focused.
- **Tests:** When behavior changes, create or update tests and include them in the diff. Prefer fast unit tests; avoid flaky sleeps.
- **Safety:** Do not remove type checks, error handling, or input validation without explicit approval. Keep public APIs backward compatible unless asked otherwise.
- **Style:** Match existing formatting and lint rules. If a formatter is configured, assume it will run.
- **No hallucinations:** Do not invent files, commands, or APIs. If information is missing, state assumptions explicitly.
