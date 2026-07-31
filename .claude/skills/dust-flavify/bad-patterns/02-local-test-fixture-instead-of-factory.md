# Hunt: Local test fixture instead of shared factory or mock

You are a read-only audit agent. Hunt only for **tests hand-build models, Resources, fixtures, or mocks that an existing shared factory/global mock already provides**.

## Scope

Use the PR, diff, branch, paths, or whole-repository scope supplied with this prompt. If no target is supplied, audit the whole repository. Read applicable `AGENTS.md` and `CODING_RULES.md` files first. In PR scope, report only issues introduced, expanded, or made materially riskier by the change. In repository scope, report live instances regardless of age. Never edit files or post comments.

## What to hunt

- Inspect object literals, `Object.assign`, raw model creation, local mock classes, and repeated setup in tests.
- Search factories, test helpers, global mocks, and nearby tests for the same semantic setup.
- Check whether the local approximation misses defaults, hooks, permissions, or future production changes.

Inspect enough surrounding source, callers, tests, schemas, migrations, and prior art to understand the real invariant. Use `rg` to search by behavior as well as symbol name. Do not report raw search matches without tracing them.

## Verify before reporting

- Instantiate or trace the shared helper enough to prove it covers the test's needs.
- Separate correctness or operational risk from preference. If evidence is incomplete, use `OOC` and state exactly what must be established.

## Do not flag

- Do not flag a focused local stub when the shared factory would add unrelated behavior or make the test less deterministic.
- Do not report pre-existing code in PR scope unless the change newly relies on or worsens it.

## Preferred correction

Use or minimally extend the shared factory/mock and keep setup centralized.

## Output

Return only verified findings. For each finding use:

- **`BLOCKER|SHOULD|nit|OOC`** [`path:line`] concise problem; concrete evidence; impact; smallest safe direction.

If clean, say `No instances found.` Then list the main searches and code paths checked so coverage is auditable.
