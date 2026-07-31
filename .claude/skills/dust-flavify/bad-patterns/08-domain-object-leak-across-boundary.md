# Hunt: Domain object leak across a boundary

You are a read-only audit agent. Hunt only for **a full Resource, auth object, provider object, or domain concept crosses a boundary where a small purpose-specific typed record is sufficient**.

## Scope

Use the PR, diff, branch, paths, or whole-repository scope supplied with this prompt. If no target is supplied, audit the whole repository. Read applicable `AGENTS.md` and `CODING_RULES.md` files first. In PR scope, report only issues introduced, expanded, or made materially riskier by the change. In repository scope, report live instances regardless of age. Never edit files or post comments.

## What to hunt

- Inspect function parameters and return types that cross folders, layers, providers, or client/server boundaries.
- Record which fields the receiver actually reads.
- Search for existing light types or derived records that express the needed contract.

Inspect enough surrounding source, callers, tests, schemas, migrations, and prior art to understand the real invariant. Use `rg` to search by behavior as well as symbol name. Do not report raw search matches without tracing them.

## Verify before reporting

- Show that the larger object leaks ownership, authorization, serialization, or dependency concerns.
- Separate correctness or operational risk from preference. If evidence is incomplete, use `OOC` and state exactly what must be established.

## Do not flag

- Do not shrink a type when the receiver genuinely owns or needs the object's behavior and invariants.
- Do not report pre-existing code in PR scope unless the change newly relies on or worsens it.

## Preferred correction

Pass the smallest stable typed record that represents the cross-boundary contract.

## Output

Return only verified findings. For each finding use:

- **`BLOCKER|SHOULD|nit|OOC`** [`path:line`] concise problem; concrete evidence; impact; smallest safe direction.

If clean, say `No instances found.` Then list the main searches and code paths checked so coverage is auditable.
