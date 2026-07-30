# Poke Dust Superuser Administration

## Recovery Context

This milestone resumes work after a hard reboot removed a temporary GSD worktree.
Four staged S01 files were recovered exactly from Git's preserved worktree index:

- `front/lib/file_storage/index.ts`
- `front/lib/poke/roles.ts`
- `front/lib/resources/user_resource.ts`
- `front/tests/utils/mocks/file_storage.ts`

Treat those changes as untrusted partial implementation: inspect them, correct them,
regenerate the lost focused tests, and verify the complete behavior. Do not assume
the prior slice was valid merely because its source was recovered.

## Outcome

Build an admin-only Poke experience for auditing, granting, updating, and revoking
Dust superuser access. Effective access is the conjunction of:

1. `User.isDustSuperUser` in the regional database.
2. Poke role assignments for the normalized user email in the GCS-hosted,
   versioned `poke-roles.json` object.

The UI must expose disagreement between these sources and support safe remediation.

## Requirements

- Add a dedicated Poke page at `/poke/superusers`, discoverable only to users with
  the existing Poke `admin` role.
- Enforce `admin` server-side on every list/read/mutation endpoint; client hiding is
  advisory only.
- List active members of the configured regional Dust workspace with name, email,
  membership state, DB flag, Poke roles, drift state, and remediation actions.
- Use existing `PRODUCTION_DUST_WORKSPACE_ID`; never hardcode workspace IDs. Current
  production values are `0ec9852c2f` US and `xt80HLpd1C` EU.
- Use existing active-membership resource methods, especially
  `MembershipResource.getActiveMemberships` where applicable.
- Respect regional DB ownership and existing Poke US/EU behavior. Do not represent
  one region as a global audit.
- Existing `DUST_` / `CP_DUST_` plan filters are not authorization sources.
- Allow grants, Poke-role updates, revokes, and drift repairs.
- Grant only to active members of the configured Dust workspace.
- Prevent removal of the last Poke admin and unsafe self-removal.
- Normalize emails consistently on every read, lookup, and write.
- Provide typed errors and actionable UI feedback for authorization, validation,
  concurrent writes, storage errors, and partial multi-store failures.

## Storage and Security

- Extend `front/lib/poke/roles.ts`; do not create another role abstraction.
- Write through the repository's GCS/FileStorage abstraction.
- Use object generation plus `ifGenerationMatch` for optimistic concurrency.
  Generation preconditions work without bucket object versioning.
- Never fall back to an unconditional write. Fail closed with typed conflict or
  storage errors and preserve unrelated users/roles.
- Authorization-sensitive reads must not retain removed/downgraded roles for five
  minutes on another process. Use fresh reads or validate generation on every
  cached auth read. Process-local invalidation alone is insufficient.
- Safe ordering: grant writes roles first then DB=true; revoke writes DB=false first
  then removes roles. Retries must be idempotent.
- Partial failures must return the actual resulting state and remediation guidance.
- Never log secrets or the full role file.

## Auditability

- Record grant, role update, revoke, and repair with actor, target, before/after
  state, region, outcome, and failure information.
- These are Dust-internal Poke operations, so record them with the structured
  internal `auditLog()` trail collected in Datadog. Do not register them as
  customer-facing WorkOS audit actions.

## UI and API

- Follow existing Poke/Dust React and design-system patterns.
- Include loading, empty, unauthorized, storage error, conflict, partial-failure,
  and success states. Confirm destructive actions.
- Keep Swagger synchronized for all new API schemas/endpoints.
- Do not introduce a breaking private API change.
- Avoid unrelated plugin refactors. Existing manifest/async-args role-enforcement
  gaps are a separate deferred concern unless the new page directly depends on
  those routes.

## Relevant Code

- `front/lib/poke/roles.ts`
- `front/lib/file_storage/index.ts`
- `front-api/middlewares/poke_auth.ts`
- `front-api/routes/poke/index.ts`
- `front/lib/api/poke/auth_context.ts`
- `front/lib/resources/user_resource.ts`
- `front/lib/resources/membership_resource.ts`
- `front/poke/swr/search.ts`
- `front-spa/src/poke/routes.tsx`
- `front/components/poke/PokeNavbar.tsx`
- `front/components/poke/pages/PluginsPage.tsx`

## Quality Gates

- First audit the recovered S01 source and add/regenerate focused tests for role
  parsing/writing, optimistic concurrency, fail-closed errors, cache freshness,
  email normalization, and non-mutation of inputs.
- Add focused tests for regional membership auditing, authorization on every new
  route, mutation ordering, last-admin protection, partial failure/idempotent retry,
  audit events, and important UI states.
- Use repository factories and conventions; avoid brittle snapshots.
- Run narrow tests/typecheck/lint first, then broader checks required by repository
  guidance. Independently prove the final deliverable before completion.
- Do not modify or commit unrelated files.

## Out of Scope

- Replacing Poke authentication or the role-file system wholesale.
- Converting other Poke plugins to dedicated pages.
- Changing unrelated plan filtering.
- Database schema migrations unless strictly required by the implementation.
