# [front] Coding Rules

Shared rules (GEN1-GEN11, SEC1-SEC2, ERR1-ERR2) are in the root `CODING_RULES.md` and apply
automatically. This file contains rules specific to the `front` workspace.

## BACKEND

### [BACK1] No sequelize models in API routes

API routes should not interact with sequelize models directly. Use `lib/api/*` interfaces (creating
them if missing). Direct Resource interaction are acceptable.

### [BACK2] No sequelize models or ModelId in `lib/api/*` interfaces

Interfaces in `lib/api/*` should not expose ModelId or sequelize model objects.

Example:

```
// BAD

function doWorkspace({ id }: { id: ModelId }) { }

// GOOD

function doWorkspace({ workspace }: { workspace: WorkspaceType }) { }
```

### [BACK3] Resource invariant: no sequelize models outside of resources

Any new model should be abstracted to the rest of the codebase through a pre-existing or new
`Resource`.

### [BACK4] Resource invariant: no models in interfaces

Resources interface should take Resource or Types but not model objects.

### [BACK5] Resource invariant: `lib/api/*` should use Resources not models

Any newly introduced function in `lib/api/*` should rely on Resources and not models directly.

### [BACK6] Use ConcurrentExecutor vs PQueue

We are deprecating our use of `PQueue` in favor of `ConcurrentExecutor`. Use `ConcurrentExecutor`
for all new code and migrate to it from `PQueue` when modifying existing code that involves
`PQueue`.

### [BACK7] Avoid `Promise.all` on dynamic arrays

Never use `Promise.all` on anything else than static arrays of promises with a known length (8 max).
To parallelize asynchronous handling of dynamic arrays, use `ConcurrentExecutor`.

### [BACK8] Favor typeguards over other methods

When checking types, use explicit typeguards over `typeof`, `instanceof`, etc.

### [BACK9] Standardized query parameters extraction

Use `{ foo } = req.query` and then test with `isString` to extract query parameters in endpoints.

Example:

```
// BAD

if (typeof req.query.aId !== "string") {
  // error
}

const r = someFunction(req.query.aId);
const r = someFunction(req.query.aId as string);

// GOOD

const { aId } = req.query;

if (isString(aId)) {
  // error
}

const r = someFunction(aId);
```

### [BACK10] Resource invariant: Resources must expose both `sId` and `id`

Resources and associated types should consistently expose both `sId` (string) and `id` (ModelId) in
their interfaces. This pattern ensures consistency across the codebase and proper type safety.

When extracting identifiers from resource objects into variables, follow this naming convention:

- For the string identifier (`sId` field): use `<resourceName>Id` (e.g., `agentId`,
  `conversationId`)
- For the numeric identifier (`id` field): use `<resourceName>ModelId` (e.g., `agentModelId`,
  `conversationModelId`)

Example:

```
// BAD
interface ResourceType {
id: string;
}
const agentSId = agent.sId;          // String identifier
const agentId = agent.id;            // Numeric ModelId

// GOOD
interface ResourceType {
sId: string;
id: ModelId;
}
const agentId = agent.sId;           // String identifier
const agentModelId = agent.id;       // Numeric ModelId
```

### [BACK11] Resource invariant: Use "Model" suffix for Sequelize models when creating Resources

When creating a new Resource that wraps a Sequelize model, the model should be renamed to include
the "Model" suffix for clarity (e.g., `Conversation` becomes `ConversationModel`).
This naming convention helps distinguish between the Resource interface and
the underlying Sequelize model implementation.

Example:

```
// BAD
class Conversation extends Model { }

// GOOD
class ConversationModel extends Model { }
```

### [BACK12] No breaking changes in API endpoints

**Public API (`pages/api/v1/`):** Breaking changes are never allowed. External consumers depend on
a stable contract. Schemas must be append-only: never remove fields. When adding a new field, it
must be optional and accept `undefined` as a value even if the latest client code always sends a
value.

**Private API (`pages/api/`):** Breaking changes are acceptable only after enough time has passed
to be confident that no old clients are still deployed. Until then, follow the same backward
compatibility rules as the public API. When introducing a breaking change, first deploy the
updated client code, wait for all old clients to cycle out, then clean up the old contract.

Example:

```
// BAD - breaks clients that haven't refreshed
interface UpdateResourceBody {
  name: string;
  newField: string | null;  // Required field added later
}

// GOOD - backward compatible
interface UpdateResourceBody {
  name: string;
  newField?: string;  // Optional, with server-side default if needed
}
```

Follow these steps based on the type of change:

**1. Deleting an endpoint:**

- Do NOT delete the endpoint immediately
- Mark the endpoint as deprecated in code comments with deprecation date
- Create the replacement endpoint or functionality first
- Monitor usage metrics to ensure all clients have migrated
- Only delete after confirmed all clients have stopped using it
- If deletion is urgent, coordinate a synchronized release across all clients

**2. Adding a mandatory input parameter:**

- Do NOT add required parameters immediately
- First: Add the parameter as optional with sensible defaults
- Update all client code to send the parameter
- Make the parameter required only after a period of time
- Document the default behavior clearly in code comments
- Example: Add `userId` as optional defaulting to current authenticated user, then make it required once all clients are updated

**3. Changing a validation schema (stricter validation):**

- Do NOT tighten validation rules on existing fields immediately
- Add new optional fields with strict validation instead
- Only enforce stricter validation after all clients are compliant

**4. Removing a response field:**

- Do NOT remove fields from responses immediately
- First: Update all client code to stop using the field
- Remove the field from backend response only after a period of time
- If removal is urgent, create a new endpoint version instead

**5. Adding or removing enum values in responses:**

- **Adding** a new enum value to responses:
  - Ensure all clients handle unknown enum values gracefully with a fallback

- **Removing** an enum value from responses:
  - Do NOT remove enum values immediately
  - First: Update all client code to stop relying on the removed value
  - Stop returning the enum value from backend only after a period of time

### [BACK13] Foreign key must be indexed

When adding a foreign key `B.a` on table `B` to a deletable object from table `A` (pretty much all
objects in the context of scrubbing a workspace) make sure to add an index on `B.a` to avoid table
scans when deleting objects from table `A`.

```
AgentMCPActionModel.belongsTo(AgentMessageModel, {
  foreignKey: { name: "agentMessageId", allowNull: false },
  as: "agentMessage",
});

AgentMessageModel.hasMany(AgentMCPActionModel, {
  foreignKey: { name: "agentMessageId", allowNull: false },
});

// Must be accompanied above in the model definition by index:

{
  fields: ["agentMessageId"],
  concurrently: true,
}
```

### [BACK14] Keep Swagger documentation in sync with API schema changes

Any change to the schema of a public or private API endpoint — including deeply nested objects in
request or response bodies — must be reflected in the existing Swagger documentation. This applies
to adding, removing, or modifying fields at any level of nesting.

In particular, check and update the following files when modifying API schemas:

- `pages/api/swagger_private_schemas.ts` for private API shared schemas
- `pages/api/v1/w/[wId]/swagger_schemas.ts` for public API shared schemas
- The `@swagger` annotation in the endpoint file itself

Every endpoint must have either `@swagger` (with proper documentation) or `@ignoreswagger`
(for internal/undocumented endpoints). This is enforced by the `lint:swagger-annotations` check.

TypeScript types that map to a swagger schema must carry a `@swaggerschema` annotation pointing
to the corresponding schema name and file. When modifying a type with this annotation, always
update the referenced swagger schema to match.

Example:

```
/**
 * @swaggerschema PrivateUser (swagger_private_schemas.ts)
 */
export type UserTypeWithWorkspaces = UserType & {
  workspaces: WorkspaceType[];
};
```

## AUDIT LOGGING

### [AUDIT1] Every state-changing operation on a security-sensitive resource MUST emit an audit log event

- Use `void emitAuditLogEvent({ auth, action, targets, context?, metadata? })` for user-initiated actions where an `Authenticator` is available
- Use `void emitAuditLogEventDirect({ workspace, action, actor, targets, context, metadata? })` for system-initiated actions (Temporal activities, webhooks, login/logout) where no `Authenticator` exists
- Never `await` the emit call; always fire-and-forget with `void`
- Audit log failures must never break the main operation (the emit functions handle this internally)

### [AUDIT2] Always prefer the real human actor over "system"

- If a human configured the automation (trigger, API key), use that human as the actor via `Authenticator.fromUserIdAndWorkspaceId(userId, workspaceId)`
- Only use `Authenticator.internalAdminForWorkspace(workspaceId)` or `emitAuditLogEventDirect` with a system actor for genuinely external events (SCIM sync, WorkOS webhooks, login failures without workspace context)

### [AUDIT3] Every new audit action requires three artifacts

- A JSON schema file at `front/admin/audit_log_schemas/<action>.json`
- The action string added to the `AuditAction` union type in `front/lib/api/audit/workos_audit.ts`
- A `void emitAuditLogEvent(...)` or `void emitAuditLogEventDirect(...)` call at the mutation site
- See `runbooks/NEW_AUDIT_EVENT.md` for the step-by-step checklist

### [AUDIT4] Place the emit call AFTER the mutation succeeds, not before

- The audit log records what happened, not what was attempted
- Exception: `user.login_failed` and similar failure events are emitted on the failure path

### [AUDIT5] Metadata values must be strings

- WorkOS SDK expects all metadata values as strings. Convert numbers and booleans with `String(value)`
- Schema files use `"string"` as the value type (e.g., `"role": "string"`)

### [AUDIT6] Always include `getAuditLogContext(auth, req)` as the `context` parameter when a `NextApiRequest` is available

- This captures the client IP from `x-forwarded-for` headers
- In Temporal activities or non-HTTP contexts, omit `context` (defaults to `auth.clientIp() ?? "internal"`) or pass `{ location: "internal" }` for direct emit

### [AUDIT7] Targets always include the workspace as the first target

- Use `emitAuditLogEventDirect(auth.getNonNullableWorkspace())` or `emitAuditLogEventDirect(workspace)`
- Additional targets follow: `{ type: "user", id: user.sId, name: user.fullName() }`, `{ type: "api_key", id: key.sId }`, etc.

### [AUDIT8] Action names follow `<resource>.<verb>` dot notation

- Resource is singular, lowercase: `user`, `api_key`, `membership`, `scim`
- Verb is past tense or descriptive: `created`, `revoked`, `role_updated`, `login_failed`
- Consistency matters: check existing `AuditAction` values before inventing new names

## MCP

### [MCP1] Single file internal servers

If possible, internal MCP servers should fit in one file. The name of the file must match the
name of the server. If having only one file is not possible, they should be placed into a folder
that contains a file `index.ts` from where the `createServer` function that creates the server
will be default exported.

### [MCP2] Tool output typing

If a tool in an internal MCP server outputs a custom resource, a `zod` schema that describes the
output must be defined in `lib/actions/mcp_internal_actions/output_schemas.ts`. This way, when
processing the tool output, a typeguard that checks the output against the schema
can be used to identify this output type. In the code of the internal server the type inferred
from the `zod` schema should be used to type the tool output.

## TESTING

### [TEST1] Functionally test endpoints

When introducing new endpoints or modifying existing endpoints, introduce functional tests. Our
tests are functional and focus at the endpoint level for now. Unit tests are not required nor
desired.

### [TEST2] Test setup through factories

Test state setup should be done through factories. Factories should return Resources whenever
possible.

### [TEST5] Avoid sequelize models in tests

Direct use of sequelize models in tests should be avoided in favor of Resources. This includes test
setup and assertions.

## REACT

### [REACT1] Always create `interface` for components Props

Components props should always be typed using an `interface`.

Example:

```
// BAD

export function Component({ name }: { name: string }) { }

// GOOD

interface MyComponentProps {
  name: string;
}

export function Component({ name }: MyComponentProps) { }
```

### [REACT2] All network operations should be abstracted in SWR files

Data fetching should rely on useSWR hooks and be abstracted in a `lib/swr/*` file.

When using a disabled param and returning a loading flag, ensure `loading` is `false` if `disabled`
is `true`.

When a hook is expected to return an array of objects, return an empty array (from `emptyArray()`)
while loading/error/disabled instead of `undefined`.

Example:

```
export function useFolders({ owner, spaceId } : { owner: LightWorkspaceType, spaceId: string }) {
  // ...
  const { data, error, mutate } = useSWRWithDefaults(...);
  // ...
  return {
    folders: data?.folders ?? emptyArray(),
    mutate,
    isFoldersLoading: !error && !data && !disabled,
    isFoldersError: error
  };
}
```

Data posting should be done in hooks colocated with the SWR hooks. Do not fetch directly in
components. Success and failure notifications should be sent from the hook.

```
export function useCreateFolder({
  owner,
  spaceId,
} : {
  owner: LightWorkspaceType;
  spaceId: string;
}) {
  const sendNotification = useSendNotification();
  // ...
  return doCreate = async (name: string) => {
    // ...
  };
};
```

When a component is not always visible (modal, sheet, drawer, panel), its SWR hooks should accept
and forward a `disabled` flag tied to visibility to avoid unnecessary API calls when the component
is mounted but not shown. Skip `disabled` only when prefetching is intentional.

```typescript
// BAD — fetches on every mount, even when the sheet is closed
function MCPServerDetails({ owner }: MCPServerDetailsProps) {
  const { mcpServers } = useMCPServers({ owner });
  // ...
}

// GOOD — fetch is skipped while the sheet is closed
function MCPServerDetails({ owner, disabled }: MCPServerDetailsProps) {
  const { mcpServers } = useMCPServers({ owner, disabled });
  // ...
}

<MCPServerDetails owner={owner} disabled={!isOpen} />
```

Reviewer: If you see an SWR hook called unconditionally inside a conditionally-visible component,
require the author to either add a `disabled` prop forwarded to the hook or justify the prefetch
with a comment.

In NextJS pages, getServerSideProps should not fetch data and return more that what's
available in authenticator. Rather rely on API endpoint and SWR calls.

### [REACT3] Any async network operation should have a visual loading state

Any load/async has a visible visual state (spinner, busy state, disabled button, etc), even if the
load time is expected to be small.

### [REACT4] Stable references on Context provider values

Object or array literals passed as Context provider `value` create a new reference on every
render, triggering re-renders of all consumers. Always memoize Context values.

```typescript
// BAD — every consumer re-renders on each parent render
<MyContext.Provider value={{ items: id ? [id] : [] }}>

// GOOD — consumers only re-render when id changes
const value = useMemo(() => ({ items: id ? [id] : [] }), [id]);
<MyContext.Provider value={value}>
```

For regular component props, only memoize when the child is wrapped in `React.memo` or the prop
is used as a hook dependency. Do not add `useMemo` preemptively.

Reviewer: If you see an inline object or array literal passed directly as a Context provider
value, require the author to memoize it.
