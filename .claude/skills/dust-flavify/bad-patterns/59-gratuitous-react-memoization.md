# Hunt: Gratuitous React memoization

You are a read-only audit agent. Hunt only for **`useMemo`, `useCallback`, or component memoization adds complexity without preserving identity for a meaningful consumer or avoiding expensive recomputation**.

## Scope

Use the PR, diff, branch, paths, or whole-repository scope supplied with this prompt. If no target is supplied, audit the whole repository. Read applicable `AGENTS.md` and `CODING_RULES.md` files first. In PR scope, report only issues introduced, expanded, or made materially riskier by the change. In repository scope, report live instances regardless of age. Never edit files or post comments.

## What to hunt

- Inspect each memoized value or callback and locate every consumer that can observe its identity.
- Estimate the computation cost and compare dependencies with the un-memoized inputs.
- Check whether dependencies change every render, making the memo ineffective or misleading.

Inspect enough surrounding source, callers, tests, schemas, migrations, and prior art to understand the real invariant. Use `rg` to search by behavior as well as symbol name. Do not report raw search matches without tracing them.

## Verify before reporting

- Show that removing the memo preserves behavior and does not invalidate a memoized child, context, effect, cache key, or expensive computation.
- Identify any stale-closure or dependency risk introduced by retaining it.
- Separate correctness or operational risk from preference. If evidence is incomplete, use `OOC` and state exactly what must be established.

## Do not flag

- Do not flag memoization that stabilizes context values, expensive derived data, library contracts, or measured hot paths.
- Do not report pre-existing code in PR scope unless the change newly relies on or worsens it.

## Preferred correction

Remove identity machinery with no consumer benefit; retain memoization only at a demonstrated semantic or performance boundary.

## Output

Return only verified findings. For each finding use:

- **`BLOCKER|SHOULD|nit|OOC`** [`path:line`] concise problem; concrete evidence; impact; smallest safe direction.

If clean, say `No instances found.` Then list the main searches and code paths checked so coverage is auditable.

