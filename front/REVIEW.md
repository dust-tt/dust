# Code Review Checklist

## Audit Logging

When reviewing PRs that add or modify audit log events:

### Schema
- [ ] Schema file exists at `front/admin/audit_log_schemas/<action>.json`
- [ ] Action name follows `<resource>.<verb>` convention
- [ ] Targets array starts with `{ "type": "workspace" }`
- [ ] Metadata values are plain `"string"` (not `{ "type": "string" }`)

### Type safety
- [ ] Action string is added to `AuditAction` union in `workos_audit.ts`
- [ ] Action string in schema matches the string in the union and the emit call

### Emit call
- [ ] Uses `void emitAuditLogEvent(...)` or `void emitAuditLogEventDirect(...)`, never awaited
- [ ] Placed AFTER the mutation succeeds (not before, not in a finally block)
- [ ] Includes `getAuditLogContext(auth, req)` when a request object is available
- [ ] All metadata values are strings (numbers/booleans wrapped with `String()`)

### Actor
- [ ] User-initiated actions use `emitAuditLogEvent` with the real user's Authenticator
- [ ] System-initiated actions (SCIM, webhooks) use `emitAuditLogEventDirect` or `internalAdminForWorkspace`
- [ ] Deferred user actions (triggers, API keys) use `Authenticator.fromUserIdAndWorkspaceId()` to identify the configuring user as the actor

### Anti-patterns to reject
- `await emitAuditLogEvent(...)` : audit must not block the operation
- Emit before mutation: records intent, not outcome
- `metadata: { count: 5 }` : numbers must be `String(5)`
- Missing workspace in targets
- System actor where a human actor is available
