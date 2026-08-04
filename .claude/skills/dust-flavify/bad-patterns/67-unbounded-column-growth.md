# Hunt: Unbounded column growth

You are a read-only audit agent. Hunt only for **`TEXT`, array, or `JSONB` columns whose size grows with user, agent, or traffic volume without any enforced bound**.

## Scope

Use the PR, diff, branch, paths, or whole-repository scope supplied with this prompt. If no target is supplied, audit the whole repository. Read applicable `AGENTS.md` and `CODING_RULES.md` files first. In PR scope, report only issues introduced, expanded, or made materially riskier by the change. In repository scope, report live instances regardless of age. Never edit files or post comments.

## What to hunt

- For each added or widened `TEXT`, array, or `JSONB` column, identify what writes it and what bounds its size.
- Distinguish a column with a fixed small domain from one that accumulates per message, per tool call, per document, or per retry.
- Check whether the value is appended to or rewritten in place, and whether any offload, truncation, or pagination path exists.
- Check whether the column is selected by hot-path queries that do not need it, and whether it is read into memory in full.

Inspect enough surrounding source, callers, tests, schemas, migrations, and prior art to understand the real invariant. Use `rg` to search by behavior as well as symbol name. Do not report raw search matches without tracing them.

## Verify before reporting

- Name the concrete write path that grows the value and the input that scales it.
- Show that no schema constraint, application-level truncation, offload to file storage, or size check bounds it.
- Separate correctness or operational risk from preference. If evidence is incomplete, use `OOC` and state exactly what must be established.

## Do not flag

- Do not flag a column whose size is bounded by a validated schema, an enforced truncation, or a small closed set of values.
- Do not flag deliberate content storage that already has an offload threshold and a documented cap.
- Do not report pre-existing code in PR scope unless the change newly relies on or worsens it.

## Preferred correction

Bound the value at the write path, offload large content to file storage with a reference in the row, and exclude the column from hot-path selects.

## Output

Return only verified findings. For each finding use:

- **`BLOCKER|SHOULD|nit|OOC`** [`path:line`] concise problem; concrete evidence; impact; smallest safe direction.

If clean, say `No instances found.` Then list the main searches and code paths checked so coverage is auditable.
