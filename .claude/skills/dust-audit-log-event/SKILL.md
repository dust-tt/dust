---
name: dust-audit-log-event
description: Add a new audit log event in `front`. Use when instrumenting a new user or system action for WorkOS audit logging, including schema creation, `AuditAction` updates, and the correct emit call after the mutation path.
---

# Front Audit Log Events

Add audit events in `front` by creating the schema, registering the action string, and emitting the
event from the correct success or failure path. The goal is to produce a valid WorkOS event without
blocking the request path.

## Workflow

### 1. Identify the event

Before editing code, determine:

- the action string, usually `<resource>.<verb>`
- the mutation or failure path that should emit it
- whether the actor is a request user, a known user outside an HTTP request, or the system
- the event tier from the Notion audit events database

### 2. Create the WorkOS schema

Create `front/admin/audit_log_schemas/<action>.json`.

Rules:

- `targets` should start with `{ "type": "workspace" }` unless the event truly has no workspace
  context
- additional targets describe the affected entities, such as `user`, `space`, `trigger`, `tool`,
  `agent`, or `api_key`
- `metadata` is optional, but every metadata value must be declared as `"string"`
- use snake_case metadata keys (see `[AUDIT9]`)

Example shape:

```json
{
  "action": "resource.verb",
  "targets": [
    { "type": "workspace" },
    { "type": "resource" }
  ],
  "metadata": {
    "field_name": "string"
  }
}
```

### 3. Register the action string

Update `front/lib/api/audit/workos_audit.ts`:

- add the new string to the `AuditAction` union
- place it in the right category section
- keep the entries alphabetized inside that section

### 4. Emit the event from the right path

Emit after the mutation succeeds unless the event explicitly represents failure.

For request-driven actions with an `Authenticator`, use:

- `emitAuditLogEvent`
- `buildWorkspaceTarget`
- `getAuditLogContext`

Pattern:

```typescript
void emitAuditLogEvent({
  auth,
  action: "resource.verb",
  targets: [
    buildWorkspaceTarget(auth.getNonNullableWorkspace()),
    { type: "resource", id: resource.sId, name: resource.name },
  ],
  context: getAuditLogContext(auth, req),
  metadata: {
    field_name: String(value),
  },
});
```

For system-driven actions such as Temporal or inbound webhooks, use `emitAuditLogEventDirect`
with an explicit system actor:

```typescript
void emitAuditLogEventDirect({
  workspace,
  action: "resource.verb",
  actor: { type: "system", id: "temporal", name: "Directory Sync" },
  targets: [buildWorkspaceTarget(workspace)],
  context: { location: "internal" },
});
```

For non-HTTP code paths where you know the user but do not already have an `Authenticator`, create
one with `Authenticator.fromUserIdAndWorkspaceId(...)` and then use `emitAuditLogEvent(...)`.

### 5. Keep the emit call non-blocking

Use `void`, not `await`, for audit emission. Audit logging should not block the main write path.

### 6. Register the schema and commit the version map (pre-merge)

WorkOS drops events whose schemas were never registered, and validates each emitted event against
the schema *version* we send. Register from your branch **before merging**, then commit the
generated version map in the same PR — the same way a DB migration file ships with the code that
needs it.

```bash
# Preview (dry-run) — does not touch WorkOS or the version map.
npx tsx front/admin/register_audit_log_schemas.ts --changed

# Register the new/changed schemas and write the version map.
npx tsx front/admin/register_audit_log_schemas.ts --execute --changed

# Or register specific actions.
npx tsx front/admin/register_audit_log_schemas.ts --execute user.login api_key.created
```

The `--execute` runs register the schemas with WorkOS and merge the latest version for each
registered action into `front/lib/api/audit/schema_versions.json`. **Commit
`schema_versions.json` in the same PR.** `createAuditLogEvent` reads it to send the right version
with every event; a stale or missing version causes WorkOS validation failures.

A CI test (`audit_log_schemas.test.ts`) fails if any `AuditAction` has no entry in the version map,
so a forgotten registration is caught before merge — just like a missing migration.

DangerJS also fails the PR if a schema file under `front/admin/audit_log_schemas/` changed but its
version in `schema_versions.json` was not bumped relative to `main` (i.e. the registration step was
skipped). In the rare case the edit is a no-op WorkOS treats as identical (so no new version is
created), add the `audit-log-ack` label to override.

## Validation

Check all of the following:

- the schema file exists at `front/admin/audit_log_schemas/<action>.json`
- the action string was added to `AuditAction`
- the emit call runs after the intended success path, or on the intended failure path for failure
  events
- `targets` start with the workspace target when a workspace exists
- metadata values are wrapped with `String(...)` when needed
- request-backed events use `getAuditLogContext(auth, req)` when `req` is available
- the emit call uses `void`
- the targets in the emit call exactly match (in type and count) the targets in the schema JSON file
- if modifying an existing event's targets, the schema JSON file has been updated to match
- if a schema JSON file was added or changed, `register_audit_log_schemas.ts --execute --changed` must be run pre-merge and the regenerated `front/lib/api/audit/schema_versions.json` committed in the same PR (the `audit_log_schemas.test.ts` version check enforces this)

## References

- `front/lib/api/audit/workos_audit.ts`
- `front/admin/audit_log_schemas/`
- `front/CODING_RULES.md` entries `[AUDIT1]` through `[AUDIT10]`
