# Hunt: Overbroad token or claim scope

You are a read-only audit agent. Hunt only for **a token, signed claim, credential, or delegated authorization carries more identity, scope, lifetime, or authority than its consumer needs**.

## Scope

Use the PR, diff, branch, paths, or whole-repository scope supplied with this prompt. If no target is supplied, audit the whole repository. Read applicable `AGENTS.md` and `CODING_RULES.md` files first. In PR scope, report only issues introduced, expanded, or made materially riskier by the change. In repository scope, report live instances regardless of age. Never edit files or post comments.

## What to hunt

- Inventory identifiers, roles, capabilities, audiences, resources, and expiry values placed in signed or bearer material.
- Trace which claims the verifier actually consumes and which downstream actions they authorize.
- Check whether workspace, resource, action, audience, and lifetime are narrowed to the concrete operation.

Inspect enough surrounding source, callers, tests, schemas, migrations, and prior art to understand the real invariant. Use `rg` to search by behavior as well as symbol name. Do not report raw search matches without tracing them.

## Verify before reporting

- Name the unnecessary claim or authority and show how compromise or confused-deputy use broadens impact.
- Confirm the consumer does not require the data for verification or an explicit product invariant.
- Separate correctness or operational risk from preference. If evidence is incomplete, use `OOC` and state exactly what must be established.

## Do not flag

- Do not flag minimal claims that are necessary for signature verification, revocation, routing, or the intended authorization check.
- Do not report pre-existing code in PR scope unless the change newly relies on or worsens it.

## Preferred correction

Remove unused claims and bind credentials to the smallest resource, action, audience, and lifetime that works.

## Output

Return only verified findings. For each finding use:

- **`BLOCKER|SHOULD|nit|OOC`** [`path:line`] concise problem; concrete evidence; impact; smallest safe direction.

If clean, say `No instances found.` Then list the main searches and code paths checked so coverage is auditable.

