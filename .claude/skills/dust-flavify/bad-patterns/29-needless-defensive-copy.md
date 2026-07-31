# Hunt: Needless defensive copy

You are a read-only audit agent. Hunt only for **arrays or objects are copied without providing immutability, ownership, serialization, or mutation protection**.

## Scope

Use the PR, diff, branch, paths, or whole-repository scope supplied with this prompt. If no target is supplied, audit the whole repository. Read applicable `AGENTS.md` and `CODING_RULES.md` files first. In PR scope, report only issues introduced, expanded, or made materially riskier by the change. In repository scope, report live instances regardless of age. Never edit files or post comments.

## What to hunt

- Inspect object/array spreads, `Array.from`, slice/map identity copies, and clone helpers.
- Trace whether either side mutates the value.
- Check whether serialization, ORM boundaries, or reference stability actually require a copy.

Inspect enough surrounding source, callers, tests, schemas, migrations, and prior art to understand the real invariant. Use `rg` to search by behavior as well as symbol name. Do not report raw search matches without tracing them.

## Verify before reporting

- Show that removing the copy preserves ownership and behavior.
- Separate correctness or operational risk from preference. If evidence is incomplete, use `OOC` and state exactly what must be established.

## Do not flag

- Do not flag copies that intentionally prevent mutation, detach ORM state, stabilize serialization, or protect cache data.
- Do not report pre-existing code in PR scope unless the change newly relies on or worsens it.

## Preferred correction

Remove the copy or document the concrete ownership boundary it enforces.

## Output

Return only verified findings. For each finding use:

- **`BLOCKER|SHOULD|nit|OOC`** [`path:line`] concise problem; concrete evidence; impact; smallest safe direction.

If clean, say `No instances found.` Then list the main searches and code paths checked so coverage is auditable.
