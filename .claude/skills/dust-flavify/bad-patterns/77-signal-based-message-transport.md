# Hunt: Temporal signals used as a message transport

You are a read-only audit agent. Hunt only for **Temporal signals carrying per-item work or per-event messages, where signal volume scales with traffic and the workflow becomes the bottleneck**.

## Scope

Use the PR, diff, branch, paths, or whole-repository scope supplied with this prompt. If no target is supplied, audit the whole repository. Read applicable `AGENTS.md` and `CODING_RULES.md` files first. In PR scope, report only issues introduced, expanded, or made materially riskier by the change. In repository scope, report live instances regardless of age. Never edit files or post comments.

## What to hunt

- For each signal, identify the sender's rate. A signal per user action, per message, per document, or per webhook delivery scales with traffic; a signal per rollout or per configuration change does not.
- Every signal appends to the workflow's history, so a long-lived workflow fed by a high-rate signal grows until it must continue-as-new or hits the history limit.
- Check whether the receiving workflow drains its signal queue faster than it fills, and what happens when it does not.
- Check payload size: signals are stored in history, so large payloads multiply the growth problem.
- Check whether the workflow is long-lived and singleton-keyed, which concentrates all traffic for a key onto one execution.
- Check whether `continueAsNew` exists and whether signals received during the transition can be lost.

Inspect enough surrounding source, callers, tests, schemas, migrations, and prior art to understand the real invariant. Use `rg` to search by behavior as well as symbol name. Do not report raw search matches without tracing them.

## Verify before reporting

- Name the sending path and the input that drives its rate.
- Show the receiving workflow's lifetime and either the absence of `continueAsNew` or a drain rate that cannot keep up.
- Separate correctness or operational risk from preference. If evidence is incomplete, use `OOC` and state exactly what must be established.

## Do not flag

- Do not flag low-rate control signals such as cancel, pause, resume, or configuration updates.
- Do not flag a debounced or coalescing queue workflow that already bounds history growth and continues as new.
- Do not report pre-existing code in PR scope unless the change newly relies on or worsens it.

## Preferred correction

Use a real queue for per-item work and reserve signals for low-rate control, or keep the signal but coalesce it and bound history with `continueAsNew`.

## Output

Return only verified findings. For each finding use:

- **`BLOCKER|SHOULD|nit|OOC`** [`path:line`] concise problem; concrete evidence; impact; smallest safe direction.

If clean, say `No instances found.` Then list the main searches and code paths checked so coverage is auditable.
