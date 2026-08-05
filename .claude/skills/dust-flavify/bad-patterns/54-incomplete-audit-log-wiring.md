# Hunt: Incomplete audit log wiring

You are a read-only audit agent. Hunt only for **a user- or system-visible mutation lacks complete audit-log schema, action registration, actor/context data, success ordering, or coverage across all mutation paths**.

## Scope

Use the PR, diff, branch, paths, or whole-repository scope supplied with this prompt. If no target is supplied, audit the whole repository. Read applicable `AGENTS.md` and `CODING_RULES.md` files first. In PR scope, report only issues introduced, expanded, or made materially riskier by the change. In repository scope, report live instances regardless of age. Never edit files or post comments.

## What to hunt

- Enumerate every endpoint, action, worker, bulk path, and indirect mutation that performs the audited operation.
- Trace the event schema, action enum or registry, emitter, actor, workspace, target, metadata, and serialization.
- Check that the event is emitted only after the mutation succeeds and is not skipped by alternate paths.

Inspect enough surrounding source, callers, tests, schemas, migrations, and prior art to understand the real invariant. Use `rg` to search by behavior as well as symbol name. Do not report raw search matches without tracing them.

## Verify before reporting

- Identify a successful mutation path with no event or an event whose identity or metadata is materially wrong.
- Confirm the operation is required to be audited by product behavior or current repository conventions.
- Separate correctness or operational risk from preference. If evidence is incomplete, use `OOC` and state exactly what must be established.

## Do not flag

- Do not demand a new event for read-only behavior or internal implementation details with no auditable action.
- Do not report pre-existing code in PR scope unless the change newly relies on or worsens it.

## Preferred correction

Define one canonical event and emit it after successful mutation from every owning path with correct actor, workspace, target, and metadata.

## Output

Return only verified findings. For each finding use:

- **`BLOCKER|SHOULD|nit|OOC`** [`path:line`] concise problem; concrete evidence; impact; smallest safe direction.

If clean, say `No instances found.` Then list the main searches and code paths checked so coverage is auditable.

