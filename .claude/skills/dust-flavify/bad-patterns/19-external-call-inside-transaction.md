# Hunt: External call inside a database transaction

You are a read-only audit agent. Hunt only for **an LLM, network, filesystem, queue, or other slow external operation runs while a SQL transaction remains open**.

## Scope

Use the PR, diff, branch, paths, or whole-repository scope supplied with this prompt. If no target is supplied, audit the whole repository. Read applicable `AGENTS.md` and `CODING_RULES.md` files first. In PR scope, report only issues introduced, expanded, or made materially riskier by the change. In repository scope, report live instances regardless of age. Never edit files or post comments.

## What to hunt

- Trace every awaited call inside transaction callbacks.
- Classify each dependency as database-local or external/slow.
- Check lock duration, retry behavior, and partial-failure semantics.

Inspect enough surrounding source, callers, tests, schemas, migrations, and prior art to understand the real invariant. Use `rg` to search by behavior as well as symbol name. Do not report raw search matches without tracing them.

## Verify before reporting

- Prove the transaction spans the external call and identify locks or resources held.
- Separate correctness or operational risk from preference. If evidence is incomplete, use `OOC` and state exactly what must be established.

## Do not flag

- Do not flag local deterministic computation or database work using the same transaction.
- Do not report pre-existing code in PR scope unless the change newly relies on or worsens it.

## Preferred correction

Move the external call outside the transaction and make the remaining state transition explicit and retry-safe.

## Output

Return only verified findings. For each finding use:

- **`BLOCKER|SHOULD|nit|OOC`** [`path:line`] concise problem; concrete evidence; impact; smallest safe direction.

If clean, say `No instances found.` Then list the main searches and code paths checked so coverage is auditable.
