# Hunt: Egress proxy bypass

You are a read-only audit agent. Hunt only for **network code can bypass the required trusted egress or static-IP proxy, or fails open to direct internet access when proxy setup fails**.

## Scope

Use the PR, diff, branch, paths, or whole-repository scope supplied with this prompt. If no target is supplied, audit the whole repository. Read applicable `AGENTS.md` and `CODING_RULES.md` files first. In PR scope, report only issues introduced, expanded, or made materially riskier by the change. In repository scope, report live instances regardless of age. Never edit files or post comments.

## What to hunt

- Trace every HTTP client, SDK transport, redirect, retry, DNS path, and fallback used by the scoped operation.
- Inspect proxy environment variables, custom agents, allowlists, no-proxy rules, and provider-specific transports.
- Check error paths to ensure missing proxy configuration cannot silently select a direct client.

Inspect enough surrounding source, callers, tests, schemas, migrations, and prior art to understand the real invariant. Use `rg` to search by behavior as well as symbol name. Do not report raw search matches without tracing them.

## Verify before reporting

- Show a reachable request path that leaves without the required proxy identity or policy enforcement.
- Confirm the destination or operation is subject to the trusted-egress requirement.
- Separate correctness or operational risk from preference. If evidence is incomplete, use `OOC` and state exactly what must be established.

## Do not flag

- Do not flag traffic explicitly exempted by policy or an approved client proven to enforce the same egress route.
- Do not report pre-existing code in PR scope unless the change newly relies on or worsens it.

## Preferred correction

Centralize the approved transport, reject missing proxy configuration, and remove direct-client fallbacks for protected traffic.

## Output

Return only verified findings. For each finding use:

- **`BLOCKER|SHOULD|nit|OOC`** [`path:line`] concise problem; concrete evidence; impact; smallest safe direction.

If clean, say `No instances found.` Then list the main searches and code paths checked so coverage is auditable.

