# Hunt: Raw Sequelize model escape

You are a read-only audit agent. Hunt only for **raw Sequelize models escape Resources into APIs, business logic, callers, or public interfaces**.

## Scope

Use the PR, diff, branch, paths, or whole-repository scope supplied with this prompt. If no target is supplied, audit the whole repository. Read applicable `AGENTS.md` and `CODING_RULES.md` files first. In PR scope, report only issues introduced, expanded, or made materially riskier by the change. In repository scope, report live instances regardless of age. Never edit files or post comments.

## What to hunt

- Trace newly returned or accepted model instances and imported model types.
- Search for direct model reload/update calls outside Resource implementations.
- Check whether callers bypass Resource authorization, normalization, or lifecycle methods.

Inspect enough surrounding source, callers, tests, schemas, migrations, and prior art to understand the real invariant. Use `rg` to search by behavior as well as symbol name. Do not report raw search matches without tracing them.

## Verify before reporting

- Demonstrate the boundary crossing and the Resource behavior that is bypassed.
- Separate correctness or operational risk from preference. If evidence is incomplete, use `OOC` and state exactly what must be established.

## Do not flag

- Do not flag code inside the Resource implementation or migration tooling where raw models are the intended layer.
- Do not report pre-existing code in PR scope unless the change newly relies on or worsens it.

## Preferred correction

Wrap model access in the appropriate Resource and expose Resource or domain types.

## Output

Return only verified findings. For each finding use:

- **`BLOCKER|SHOULD|nit|OOC`** [`path:line`] concise problem; concrete evidence; impact; smallest safe direction.

If clean, say `No instances found.` Then list the main searches and code paths checked so coverage is auditable.
