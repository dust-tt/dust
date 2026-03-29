# Adding a New Audit Log Event

This runbook covers how to add a new audit log event to the Dust platform. Each event requires a schema, a type entry, and an emit call.

## Prerequisites

- Know which action you are instrumenting (e.g., `resource.verb`)
- Identify the code location where the mutation happens
- Determine the tier (1-4) from the audit events database in Notion

## Steps

### 1. Create the JSON schema

Create `front/admin/audit_log_schemas/<action>.json`:

```json
{
  "action": "<resource>.<verb>",
  "targets": [
    { "type": "workspace" },
    { "type": "<target_resource>" }
  ],
  "metadata": {
    "<key>": "string"
  }
}
```

**Rules:**
- `targets` always starts with `{ "type": "workspace" }` unless the event has no workspace context (rare)
- Additional targets represent the affected resource(s): `user`, `api_key`, `space`, `trigger`, `agent`, `tool`, `group`, etc.
- `metadata` is optional. All values must be `"string"` (the WorkOS SDK serializer handles the wrapping)
- Use camelCase for metadata keys

### 2. Add the action to the AuditAction type

In `front/lib/api/audit/workos_audit.ts`, add the new action string to the `AuditAction` union type. Insert it in the correct category section (see existing comments) in alphabetical order within that section.

```typescript
type AuditAction =
  // ... existing actions ...
  | "resource.verb"  // <-- add here
```

### 3. Add the emit call

**For user-initiated actions (API routes with Authenticator):**

```typescript
import {
  emitAuditLogEvent,
  buildWorkspaceTarget,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";

// After the mutation succeeds:
void emitAuditLogEvent({
  auth,
  action: "resource.verb",
  targets: [
    buildWorkspaceTarget(auth.getNonNullableWorkspace()),
    { type: "target_resource", id: resource.sId, name: resource.name },
  ],
  context: getAuditLogContext(auth, req),
  metadata: {
    relevantField: String(value),
  },
});
```

**For system-initiated actions (Temporal, webhooks, no Authenticator):**

```typescript
import {
  emitAuditLogEventDirect,
  buildWorkspaceTarget,
} from "@app/lib/api/audit/workos_audit";

void emitAuditLogEventDirect({
  workspace,
  action: "resource.verb",
  actor: { type: "system", id: "temporal", name: "Directory Sync" },
  targets: [
    buildWorkspaceTarget(workspace),
    { type: "user", id: user.sId, name: user.fullName },
  ],
  context: { location: "internal" },
  metadata: {
    directoryId: String(directoryId),
  },
});
```

**For non-HTTP contexts with a known user but no Authenticator:**

Build an Authenticator from the known user:
```typescript
const auth = await Authenticator.fromUserIdAndWorkspaceId(userId, workspaceId);
void emitAuditLogEvent({
  auth,
  action: "resource.verb",
  // ...
});
```

### 4. Verify

- [ ] Schema file exists at `front/admin/audit_log_schemas/<action>.json`
- [ ] Action string is in the `AuditAction` union type
- [ ] Emit call is placed after the mutation succeeds (or on the failure path for failure events)
- [ ] Emit call uses `void` (not `await`)
- [ ] Context includes `getAuditLogContext(auth, req)` when a request object is available
- [ ] Metadata values are all strings (use `String()` for numbers/booleans)
- [ ] Targets start with the workspace target

### 5. Register schemas with WorkOS (post-merge)

After your PR is merged and before deploying, register the new schema(s) with WorkOS:

```bash
# Preview what will be registered
npx tsx front/admin/register_audit_log_schemas.ts --changed

# Register only schemas changed since main
npx tsx front/admin/register_audit_log_schemas.ts --execute --changed

# Or register specific actions by name
npx tsx front/admin/register_audit_log_schemas.ts --execute user.login api_key.created
```

WorkOS silently rejects events without a registered schema. This step is required before the events will appear in customer audit logs.

## Reference

- Audit module: `front/lib/api/audit/workos_audit.ts`
- Schemas: `front/admin/audit_log_schemas/`
- Coding rules: See `[AUDIT1]`-`[AUDIT8]` in `CODING_RULES.md`
- Event database: Notion, "Audit: Access and Audit Logging for Enterprise Compliance"
