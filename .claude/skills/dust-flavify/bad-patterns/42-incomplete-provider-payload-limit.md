# Hunt: Incomplete provider payload limit

You are a read-only audit agent. Hunt only for **a provider payload limit is enforced for only some message roles, content forms, transformations, or units**.

## Scope

Use the PR, diff, branch, paths, or whole-repository scope supplied with this prompt. If no target is supplied, audit the whole repository. Read applicable `AGENTS.md` and `CODING_RULES.md` files first. In PR scope, report only issues introduced, expanded, or made materially riskier by the change. In repository scope, report live instances regardless of age. Never edit files or post comments.

## What to hunt

- Identify the provider's exact limit and whether it applies to bytes, characters, tokens, images, messages, or the total serialized request.
- Trace system, developer, user, assistant, tool, attachment, and transformed content through final serialization.
- Check truncation or rejection ordering after templates, tool results, encoding, and provider-specific expansion.

Inspect enough surrounding source, callers, tests, schemas, migrations, and prior art to understand the real invariant. Use `rg` to search by behavior as well as symbol name. Do not report raw search matches without tracing them.

## Verify before reporting

- Construct a supported payload path that bypasses or miscomputes the limit.
- Confirm the authoritative provider contract and the unit used at the final boundary.
- Separate correctness or operational risk from preference. If evidence is incomplete, use `OOC` and state exactly what must be established.

## Do not flag

- Do not flag an earlier approximate guard when an exact, comprehensive check also runs at the provider boundary.
- Do not report pre-existing code in PR scope unless the change newly relies on or worsens it.

## Preferred correction

Enforce the authoritative limit once on the complete final payload, with explicit units and deterministic overflow behavior.

## Output

Return only verified findings. For each finding use:

- **`BLOCKER|SHOULD|nit|OOC`** [`path:line`] concise problem; concrete evidence; impact; smallest safe direction.

If clean, say `No instances found.` Then list the main searches and code paths checked so coverage is auditable.

