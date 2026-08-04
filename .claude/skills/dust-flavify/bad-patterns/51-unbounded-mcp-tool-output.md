# Hunt: Unbounded MCP or tool output

You are a read-only audit agent. Hunt only for **an MCP server or agent tool can return unbounded data without byte, item, token, pagination, truncation, or overflow controls**.

## Scope

Use the PR, diff, branch, paths, or whole-repository scope supplied with this prompt. If no target is supplied, audit the whole repository. Read applicable `AGENTS.md` and `CODING_RULES.md` files first. In PR scope, report only issues introduced, expanded, or made materially riskier by the change. In repository scope, report live instances regardless of age. Never edit files or post comments.

## What to hunt

- Trace query parameters, upstream response sizes, pagination loops, aggregation, serialization, and model-context insertion.
- Check text, binary, attachment, log, search, and error output paths, including provider or SDK defaults.
- Look for limits expressed in the wrong unit or applied before an expansion step.

Inspect enough surrounding source, callers, tests, schemas, migrations, and prior art to understand the real invariant. Use `rg` to search by behavior as well as symbol name. Do not report raw search matches without tracing them.

## Verify before reporting

- Construct a valid input or upstream response that exceeds a practical transport, memory, latency, or model-context bound.
- Confirm no lower layer already enforces a strict comprehensive maximum.
- Separate correctness or operational risk from preference. If evidence is incomplete, use `OOC` and state exactly what must be established.

## Do not flag

- Do not flag inherently bounded enums or metadata responses whose maximum size is small and established.
- Do not report pre-existing code in PR scope unless the change newly relies on or worsens it.

## Preferred correction

Enforce explicit final-output bounds, paginate where useful, and return deterministic truncation or overflow metadata.

## Output

Return only verified findings. For each finding use:

- **`BLOCKER|SHOULD|nit|OOC`** [`path:line`] concise problem; concrete evidence; impact; smallest safe direction.

If clean, say `No instances found.` Then list the main searches and code paths checked so coverage is auditable.

