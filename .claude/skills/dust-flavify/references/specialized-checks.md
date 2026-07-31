# Specialized dust-flavify checks

Read this file completely when the target touches any domain listed below. Apply only relevant
checks.

## Contents

- Database and migrations
- Prompt caching and LLM abstractions
- SSE, streaming, and async infrastructure
- Sandbox and E2B security
- MCP and agent tools
- APIs, audit logging, observability, and CI
- React, SWR, and tests

## Database and migrations

- Put `workspaceId` first in workspace-scoped compound indexes when it matches the access pattern.
- Add indexes for foreign keys to deletable resources and use `concurrently: true` where current
  migration rules require it.
- Do not add speculative or redundant indexes. Explain the query that consumes each new index.
- Avoid `upsert` when a known-existence branch is clearer and sequence churn matters.
- Prefer associations over parallel manual foreign-key conventions.
- Separate additive and destructive schema changes so rollback remains possible.
- Make `NOT NULL` additions and backfills deploy-safe and explicit.
- Use dual-write/dual-read only for a defined transition; add a dated removal TODO and follow-up.
- Make standalone data migrations restartable and verifiable.
- Require regional application/verification steps when migrations run in multiple regions.
- Delete by stable identifier rather than a mutable lookup field.
- Never call an LLM or slow external service inside a SQL transaction.
- Bound `TEXT`, array, and `JSONB` columns at the write path. Offload large content to file storage
  and keep it out of hot-path selects.
- Before adding a foreign key, establish the referenced table's volume. On a high-volume parent,
  add the constraint `NOT VALID` and validate separately, index the referencing column, and replace
  unbounded cascades with a bounded cleanup path.
- Keep one table per conceptual object. Split only for a genuinely independent lifecycle or access
  pattern, not for variants that a discriminated column expresses.
- Prefer one complete insert over insert-then-update or check-then-insert. Let a unique constraint
  or an upsert resolve conflicts instead of a read-then-write race.
- Avoid indexing columns rewritten on most updates, such as `updatedAt`, counters, and heartbeats,
  on high-write tables.
- Keep advisory and row locks scoped to the critical section. A transaction-scoped advisory lock is
  held until commit; check its key cardinality, its acquisition order, and what runs while held.
- Repeat scoping predicates explicitly on every joined table that carries the column, including
  inside Sequelize `include` blocks. A predicate on one side does not constrain the other.

## Prompt caching and LLM abstractions

- Keep user- and conversation-specific values out of cacheable system prompts.
- Put per-request data in the appropriate per-message or ephemeral context block.
- Keep cacheable sections deterministically ordered with a stable tie-breaker.
- Avoid relative timestamps in cacheable content.
- Count provider cache breakpoints across the entire request, not one message in isolation.
- Separate stable instructions, shared context, and ephemeral context.
- Keep provider-specific cache behavior inside provider implementations.
- For model/provider routing or configuration changes, enumerate affected variants, regions,
  reasoning modes, feature flags, context tiers, persisted conversation formats, and provider
  limits. Keep runtime schemas and type declarations synchronized; smoke-test the provider path or
  explain why it cannot be exercised.
- Avoid emojis and indiscriminate `CRITICAL` labels in model instructions.
- Prefer ASCII where equivalent prompt copy avoids tokenization or copying surprises.
- Instrument cache ratio before claiming a cache optimization.

## SSE, streaming, and async infrastructure

- In Next.js SSE handlers, observe `res.on("close")` rather than `req.on("close")`.
- Do not gzip SSE responses.
- Coalesce high-frequency token events.
- Release retained payload arrays between async-generator iterations.
- Cancel losing timers in `Promise.race` patterns.
- Use the ingress-required `/api/sse/` prefix where applicable.
- Verify that Redis "pipelines" actually reduce round trips.
- Verify ordering before zipping arrays from independent queries.
- Do not rely on `beforeunload` to complete async work.
- Follow Temporal `patched` -> `deprecatePatch` -> removal ordering.
- Keep workflow code deterministic: no `Date.now`, `Math.random`, direct IO, module-level mutable
  state, or unstable iteration order. Use the SDK's deterministic primitives and move the rest into
  activities. Guard command-sequence edits with a patch or a new workflow type.
- Reserve Temporal signals for low-rate control. Per-item or per-event work belongs in a queue;
  signals append to history, so bound long-lived workflows with `continueAsNew`.
- Invalidate a cached value from every mutation path that feeds it, not only the owning entity's.
  Treat a permission- or membership-derived cache as an authorization surface.
- Version the cache key namespace whenever a cached or queued payload shape changes, and validate
  on read so an incompatible entry is discarded rather than misinterpreted across a rolling deploy.
- Before changing worker queues or namespaces, protocol versions, or retry behavior, prove retries
  cannot repeat side effects, bind every accepted version to a decoder, prevent old or
  non-production workers from consuming new traffic, and order deploy, drain, and removal steps.

## Sandbox and E2B security

- Apply the current root `SEC` rules, including root-command absolute paths, `execRoot`, option
  injection, helper ownership, and root-consumed lookup-directory permissions.
- Check `SandboxCapability` before mounting or invoking optional functionality.
- For a changed sandbox token, endpoint, or protocol, trace one end-to-end path with the currently
  released client or worker. Check claim shape, TTL and refresh behavior, capability gates,
  middleware, required egress proxying, and a clear incompatibility failure.
- For a bundled CLI or package, verify supported inputs, required companion binaries, credential or
  secret sources, the CPU/memory envelope, and one minimal invocation. Installation success alone
  is not feature readiness.
- Use downscoped STS tokens instead of raw service-account credentials.
- Keep service names, cache keys, and persistent primitives workspace-scoped.
- Audit environment-variable merge precedence and protect reserved names.
- Keep workload-writable paths out of privileged discovery and activation lookup paths.
- Verify auth wrappers reject `auth.role === "none"`.
- Document filesystem or `gcsfuse` trade-offs that alter consistency or isolation.
- Use sentinel state for asynchronous setup when partial readiness is observable.

## MCP and agent tools

- Follow the current MCP coding rules, including output typing and tool-description grammar.
- Keep the established server folder/file layout unless the current rules specify another pattern.
- Use discriminated unions for tool entries and results.
- Treat scoped paths and signed claims as authorization scope; never trust client paths alone.
- Make descriptions explain the input, result shape, and recovery path without bloating prompts.
- Make continuation require re-invocation, not extra model reasoning.
- Bound output by bytes with `Buffer.byteLength` and offload oversized content safely.
- Avoid indexing sandbox-generated overflow files when offload is only a transport mechanism.
- Update MCP metadata snapshots when server/tool registrations change.
- Include deterministic edit semantics such as `expected_occurrences` or explicit replace-all.
- Check reconnect timeout, retry, and backoff behavior.

## APIs, audit logging, observability, and CI

- Preserve public API compatibility and phase private API breaks across deployed clients.
- Keep handlers thin and business logic in the current business-layer location.
- Do not return HTTP envelopes from business-layer functions.
- Validate runtime inputs with the repository's current schema library.
- Return created/updated Resources where the existing API convention expects them.
- Keep Swagger annotations and shared schemas synchronized.
- Use method-preserving redirects where request bodies must survive.
- Require an explicit unsupported-method response and its endpoint test where current rules require
  it.
- Emit audit events after successful security-sensitive mutations.
- Keep audit schemas, action registries, emit sites, and WorkOS registration synchronized.
- Use the real human actor and the required audit context/target ordering.
- Keep Datadog tag cardinality bounded; remember dimensions multiply.
- Prefer child loggers with stable context and avoid redundant logging.
- Instrument before optimizing when production behavior is unknown.
- Pin deploy artifacts and dependency versions; do not rely on `latest`.
- Check workflow ordering, deploy tags, and ordered deploy-plan steps.

## React, SWR, and tests

- Use the current canonical SWR wrapper and mutation pattern.
- Keep network operations in the established SWR abstraction.
- Provide a visible loading state for async user actions.
- Keep Context provider values referentially stable.
- Use the frontend-safe exhaustive-switch helper for API data.
- Avoid gratuitous `useMemo` and `useCallback`.
- Make disabled hooks safe and use the existing options-bag convention.
- Use react-hook-form plus Zod when they remove handwritten state or validation boilerplate, even
  for one field. Use local state only when the form is truly trivial.
- Keep coupled state together when one half is invalid without the other.
- Prefer semantic pointer events over simulated DOM clicks.
- Use colocated Vitest tests, shared factories, API helpers, and Resources rather than raw models.
- Test observable behavior, deterministic output, unsupported methods, and error paths as relevant.
- Prefer several focused tests with shared setup over one scenario that asserts unrelated concerns.
