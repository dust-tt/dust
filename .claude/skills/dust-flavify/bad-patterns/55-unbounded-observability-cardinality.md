# Hunt: Unbounded observability cardinality

You are a read-only audit agent. Hunt only for **metric tags, aggregation keys, or indexed observability attributes include unbounded user, workspace, request, URL, identifier, or raw-error values**.

## Scope

Use the PR, diff, branch, paths, or whole-repository scope supplied with this prompt. If no target is supplied, audit the whole repository. Read applicable `AGENTS.md` and `CODING_RULES.md` files first. In PR scope, report only issues introduced, expanded, or made materially riskier by the change. In repository scope, report live instances regardless of age. Never edit files or post comments.

## What to hunt

- Inspect added or changed metric tags, span attributes used for grouping, log facets, dashboards, and alert dimensions.
- Classify each value as bounded enum, controlled bucket, or unbounded data.
- Estimate multiplication across dimensions and trace raw errors or URLs that embed dynamic identifiers.

Inspect enough surrounding source, callers, tests, schemas, migrations, and prior art to understand the real invariant. Use `rg` to search by behavior as well as symbol name. Do not report raw search matches without tracing them.

## Verify before reporting

- Name the unbounded dimension and show how normal traffic creates continuously new series or indexed values.
- Confirm the backend treats the field as a tag, metric label, group key, or otherwise cardinality-sensitive attribute.
- Separate correctness or operational risk from preference. If evidence is incomplete, use `OOC` and state exactly what must be established.

## Do not flag

- Do not flag high-cardinality values stored only as non-indexed diagnostic fields when the observability backend and policy permit them.
- Do not report pre-existing code in PR scope unless the change newly relies on or worsens it.

## Preferred correction

Keep aggregation dimensions bounded, bucket variable values, and move detailed identifiers to appropriately controlled diagnostic context.

## Output

Return only verified findings. For each finding use:

- **`BLOCKER|SHOULD|nit|OOC`** [`path:line`] concise problem; concrete evidence; impact; smallest safe direction.

If clean, say `No instances found.` Then list the main searches and code paths checked so coverage is auditable.

