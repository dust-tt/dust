# Hunt: Raw models in tests

You are a read-only audit agent. Hunt only for **tests construct, reload, mutate, or assert through raw persistence models instead of the domain Resource and shared factory boundary**.

## Scope

Use the PR, diff, branch, paths, or whole-repository scope supplied with this prompt. If no target is supplied, audit the whole repository. Read applicable `AGENTS.md` and `CODING_RULES.md` files first. In PR scope, report only issues introduced, expanded, or made materially riskier by the change. In repository scope, report live instances regardless of age. Never edit files or post comments.

## What to hunt

- Search tests for direct model `create`, `build`, `find`, `reload`, `update`, and `destroy` calls in domains that expose Resources.
- Find shared test factories and Resource methods for the same setup or assertion.
- Trace whether raw access bypasses invariants, scopes, hooks, serialization, or stable identifiers.

Inspect enough surrounding source, callers, tests, schemas, migrations, and prior art to understand the real invariant. Use `rg` to search by behavior as well as symbol name. Do not report raw search matches without tracing them.

## Verify before reporting

- Show the available canonical factory or Resource path and the invariant or coupling bypassed by the raw model.
- Distinguish domain behavior tests from persistence-layer tests that intentionally exercise the model.
- Separate correctness or operational risk from preference. If evidence is incomplete, use `OOC` and state exactly what must be established.

## Do not flag

- Do not flag model unit tests, migration tests, or persistence integration tests whose subject is explicitly the model layer.
- Do not report pre-existing code in PR scope unless the change newly relies on or worsens it.

## Preferred correction

Build fixtures with shared factories and assert behavior through Resources; keep raw-model access inside tests of the persistence boundary itself.

## Output

Return only verified findings. For each finding use:

- **`BLOCKER|SHOULD|nit|OOC`** [`path:line`] concise problem; concrete evidence; impact; smallest safe direction.

If clean, say `No instances found.` Then list the main searches and code paths checked so coverage is auditable.

