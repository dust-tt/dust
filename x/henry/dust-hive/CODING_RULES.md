# dust-hive Coding Rules

## General
- Make only the changes required for the task. Avoid opportunistic refactors.
- Keep code simple and readable; prefer small, explicit functions over clever abstractions.
- Do not mutate function parameters; return new values instead.
- Use `const` by default; use `let` only when reassignment is required.

## TypeScript
- Strict mode is expected. Do not introduce `any`.
- Avoid non-null assertions (`!`).
- Avoid unsafe `as` casts. Prefer typeguards or validation helpers.
- Use `import type` for type-only imports.

## Error Handling (no defensive patterns)
- Do not hide or paper over errors with defaults. If a value is required, fail fast with a clear error.
- Never swallow errors (empty `catch`, or log-and-continue) unless the caller explicitly accepts partial failure.
- Use `Result<T, E>` when callers need to handle failures; otherwise let exceptions bubble.
- Only wrap the minimal statement that can throw. Do not wrap whole functions in `try/catch`.
- Do not convert failures into success (e.g., returning `Ok` after a failed step).

## Structure
- Keep CLI concerns (printing usage, exiting) in `src/index.ts`; library helpers should return data or `Result`.
- Prefer centralized config/registry data over duplicating lists or constants in multiple files.

## Comments
- Add comments only when logic is non-obvious. Keep them short and focused.
