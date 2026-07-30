# Poke Superuser Administration — Security and Completeness Corrections

## Context

Milestone M001 produced the initial Poke superuser administration feature. An
independent review found correctness and security gaps that must be fixed before
the feature is considered complete. Treat the existing implementation and tests
as untrusted: some tests currently codify unsafe behavior.

## Required Corrections

1. The list API must return every active member of the configured regional Dust
   workspace, including members whose drift state is `none`. Without these rows,
   an admin cannot grant access to a normal member. Keep batched Resource access
   and move the non-trivial join/drift logic out of the HTTP handler into
   `front/lib/api/poke/superusers.ts` per BACK16/BACK18.

2. Grant must prove the target is an active member of the configured regional
   Dust workspace before writing either store. Add focused tests for active,
   inactive, and non-member targets.

3. Do not put email addresses in mutation URLs (SEC1). Identify the target by
   user `sId` in routes and client hooks; resolve and normalize email internally.
   Never expose or accept a numeric ModelId (SEC2).

4. Never invent `admin` during `db_only` drift repair. Repairing `db_only` must
   require the admin to supply a non-empty validated role selection, and the UI
   must present that choice. `roles_only` repair may set the DB flag to true using
   the existing roles. Preserve generation preconditions and fail closed.

5. Last-admin protection must count effective Poke admins, not stale role-file
   entries. Effective access requires both `isDustSuperUser=true` and an `admin`
   Poke role. Keep the self-removal guard and cover stale `roles_only` admin
   entries in tests.

6. Keep role arrays non-empty for grant, role update, and `db_only` repair.
   Preserve safe ordering and report accurate resulting drift states on every
   partial failure (`roles_only` after a failed second step in both grant and
   revoke where roles remain but the DB flag is false).

7. Make `SuperuserMutationError` a proper discriminated union so the
   `partial_failure` branch always contains `partialFailure`; remove unsafe
   non-null assertions from HTTP error mapping.

8. The Poke navbar entry must only be rendered for users with the existing
   Poke `admin` role. Server-side admin authorization remains mandatory on every
   list and mutation route. Add endpoint-level tests proving 403 for every method.

9. Internal audit records must contain actor, workspace and target user IDs,
   before/after DB and role state, region, outcome, and partial-failure
   information where a state-changing operation only partially succeeds. Emit
   them through the structured `auditLog()` trail collected in Datadog after the
   relevant state change. Do not expose Poke-only actions through WorkOS.

10. Do not add WorkOS schemas or schema-version entries for these internal
    Poke actions. They are not customer audit-log events.

11. Keep every new internal endpoint annotated with `@ignoreswagger` and run the
    Swagger annotation lint. Do not change any existing private API contract.

12. Add focused functional endpoint tests and business-layer tests for listing
    all active members, admin authorization, sId targeting, active-membership
    grants, safe repair behavior, effective last-admin protection, optimistic
    conflicts, partial failures, and audit emission. Use factories/Resources and
    avoid mocking the database except where a deliberate second-store failure
    must be induced.

13. Keep UI network operations in the SWR module, show loading and mutation
    progress, surface conflict and partial-failure remediation, confirm
    destructive actions, and avoid effects for derived state.

## Acceptance Gate

- No hardcoded US or EU Dust workspace IDs; use
  `config.getProductionDustWorkspaceId()`.
- No email in request paths or query strings.
- No grant to a non-active member.
- No implicit privilege escalation during repair.
- No stale role-only account may make last-admin protection pass.
- No guessed audit schema versions.
- Focused tests, typecheck of changed files, formatting/lint, Swagger annotation
  lint, and audit schema lint all pass.
- Independently review the complete diff after corrections.
