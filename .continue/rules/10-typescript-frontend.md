---
name: TypeScript & React Conventions
globs: ["**/*.ts", "**/*.tsx"]
description: Guidance for TS/React code when editing those files.
---

# TypeScript
- Enable/retain strict typing. Avoid `any`; prefer explicit interfaces and discriminated unions.
- Keep function signatures stable; add optional params instead of breaking changes.
- Narrow types with guards; prefer `unknown` + refinement over `any`.

# React
- Use functional components and hooks. Prefer derived state over duplicated state.
- Keep components pure; isolate I/O in effects or services.
- Memoize heavy computations with `useMemo`/`useCallback` when profiling indicates need.
- Follow accessibility best practices (labels, roles, keyboard nav).
