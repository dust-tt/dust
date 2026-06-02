# My contributions

This fork is kept public only as a record of small upstream contributions and legal-product observations relevant to supervised agent workflows.

## Upstream pull request

- `docs(sdks/js): fix AbortError detection in streaming example`
- Purpose: make the SDK README example detect caller-initiated stream aborts through the error name rather than message-text matching.
- Scope: documentation/example robustness only.

## Product/legal issue

- `[Audit Logs] Emit events for human approval and rejection of gated tool actions`
- Purpose: suggest clearer audit-log events for approval and rejection of gated tool actions.
- Legal-product relevance: consequential agent actions should leave a reviewable event trail that records the human decision state.

## Why this is here

For a General Counsel role at an AI-native SaaS company, the relevant signal is not the fork itself. The signal is the control question: where agentic workflows create consequential actions, the legal function should care about permissions, approval states, audit logs and accountability.
