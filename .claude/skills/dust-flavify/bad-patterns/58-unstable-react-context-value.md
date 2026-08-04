# Hunt: Unstable React context value

You are a read-only audit agent. Hunt only for **a React context provider recreates an object, array, or function value on unrelated renders and causes avoidable consumer invalidation**.

## Scope

Use the PR, diff, branch, paths, or whole-repository scope supplied with this prompt. If no target is supplied, audit the whole repository. Read applicable `AGENTS.md` and `CODING_RULES.md` files first. In PR scope, report only issues introduced, expanded, or made materially riskier by the change. In repository scope, report live instances regardless of age. Never edit files or post comments.

## What to hunt

- Inspect context provider `value` expressions and every dependency captured by included callbacks or objects.
- Trace which provider state changes should and should not invalidate consumers.
- Check whether the context is broad enough that identity churn causes meaningful rerenders or effects.

Inspect enough surrounding source, callers, tests, schemas, migrations, and prior art to understand the real invariant. Use `rg` to search by behavior as well as symbol name. Do not report raw search matches without tracing them.

## Verify before reporting

- Show that the value identity changes while its observable contents do not and that consumers subscribe to the context.
- Establish a meaningful rerender, effect, or performance consequence rather than relying on a blanket memoization rule.
- Separate correctness or operational risk from preference. If evidence is incomplete, use `OOC` and state exactly what must be established.

## Do not flag

- Do not flag a tiny provider whose value necessarily changes every render or where memoization adds no observable benefit.
- Do not report pre-existing code in PR scope unless the change newly relies on or worsens it.

## Preferred correction

Stabilize only the provider value and callbacks whose unchanged identity prevents real consumer invalidation, with complete dependencies.

## Output

Return only verified findings. For each finding use:

- **`BLOCKER|SHOULD|nit|OOC`** [`path:line`] concise problem; concrete evidence; impact; smallest safe direction.

If clean, say `No instances found.` Then list the main searches and code paths checked so coverage is auditable.

