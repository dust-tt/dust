# Sandbox Environment Manager — Implementation Plan

## 1. Goal

Add a workspace-level secret manager for sandbox env vars. Workspace admins
write secrets (name + value) once; values are encrypted at rest and never
re-exposed in the UI. On sandbox boot, all workspace env vars are merged into
the sandbox process environment so agent-run code can read them via standard
`process.env` / `os.environ`.

The existing **Network** admin page (`/w/[wId]/developers/egress-policy`,
`EgressPolicyPage.tsx`) is renamed to **Sandbox** and gains a second section,
**Environment**, below the existing network controls.

## 2. Decisions (locked)

| Topic | Decision |
| --- | --- |
| Page URL | Rename to `/w/[wId]/developers/sandbox`; delete the old route in the same PR (no redirect — feature is Dust-only-flag-gated, no external bookmarks) |
| Page layout | Single page, two stacked sections (Network, Environment) |
| Update semantics | `POST` with same name overwrites the value (rotation) |
| Encryption | Reuse `config.getDeveloperSecretsSecret()` (same as `DustAppSecret`) |
| Algorithm | AES-256-CBC via `front/types/shared/utils/encryption.ts` |
| Scope | Workspace-wide; every sandbox in the workspace gets all vars |
| Feature flag | Reuse `sandbox_tools` (no new flag) |
| Bulk paste `.env` | **Not in v1** |
| Agent visibility | Agent may **use** env vars from code, but must not inspect/print/echo them. Mitigated via skill instructions + best-effort bash-tool output redaction (v1 scope: bash only, final-payload only). Not a guarantee — see §6 limitations. No system-prompt hint listing names. |
| Name validation | `^[A-Z][A-Z0-9_]{0,63}$`, reserved-prefix blocklist, ≤ 50/workspace |
| Audit | New `sandbox_env_var.{created,updated,deleted}` actions |

### 2.1 Reserved name blocklist

Reject the following on create/update:

- Exact: `PATH`, `HOME`, `USER`, `SHELL`, `PWD`, `TERM`, `LANG`, `LC_ALL`,
  `HOSTNAME`, `TMPDIR`
- Prefix: `LD_*`, `DUST_*`, `SANDBOX_*`, `E2B_*`, `DD_*`, `CONVERSATION_*`,
  `WORKSPACE_*`
- Leading underscore: `_*`

Rationale: prevents admins from breaking the sandbox boot environment, and
prevents shadowing of variables we inject in
`sandbox_resource.ts` (`DD_API_KEY`, `DD_HOST`, `CONVERSATION_ID`,
`WORKSPACE_ID`).

## 3. Data Model

### 3.0 Why a new table (not reusing `DustAppSecret`)

Considered and rejected. The existing `DustAppSecret` model already does
encryption with the same key and would save ~a day of work, but reusing it
creates problems we don't want:

- **Namespace collision.** `DustAppSecret` rows are referenced by name in
  Dust app / MCP server config (`secrets.MY_KEY`). Mixing sandbox env vars
  into the same table means a sandbox secret could silently rebind a Dust
  app block, or a Dust app secret could leak into every sandbox env.
- **Different validation.** Sandbox env vars need strict POSIX names + a
  reserved-prefix blocklist (`PATH`, `LD_*`, `DD_*`, …). Applying that to
  `DustAppSecret` would break existing rows; not applying it loses the
  protection.
- **Different visibility.** `DustAppSecret` exposes a 1-char redacted
  preview after creation; sandbox env vars must be write-only with no
  preview at all.
- **Different audit lineage.** Mixed events make "who changed sandbox
  secrets" un-answerable.
- **Different lifecycle.** If sandbox secrets ever get scoping, rotation
  policies, or a separate access boundary, splitting later is a painful
  data migration.

Encryption helpers and the `DeveloperSecretsSecret` key are still shared.
A common base resource is **not** introduced for two consumers — revisit
if a third use case appears.

### 3.1 Sequelize model

`front/lib/resources/storage/models/workspace_sandbox_env_var.ts`
(matches existing convention, e.g. `apps.ts`, `agent_memories.ts`)

```ts
class WorkspaceSandboxEnvVarModel extends WorkspaceAwareModel {
  declare id: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare workspaceId: ForeignKey<WorkspaceModel["id"]>;
  declare name: string;             // validated against allowlist regex
  declare encryptedValue: string;   // AES-256-CBC ciphertext (TEXT)
  declare createdByUserId: ForeignKey<UserModel["id"]> | null;
  declare lastUpdatedByUserId: ForeignKey<UserModel["id"]> | null;
}
```

Indexes:
- Unique `(workspaceId, name)` — enforces one row per name per workspace and
  makes `(wId, name)` lookups fast for delete and overwrite.
- Per `[BACK13]`, FK columns `workspaceId`, `createdByUserId`,
  `lastUpdatedByUserId` need explicit indexes.

Migration: a SQL file under `front/migrations/db/migration_N.sql`, generated
via `./front/create_db_migration_file.sh` (which picks the next `N` and
scaffolds the file). Register the new model in `front/admin/db.ts` so
`init_db.sh` picks it up.

### 3.2 Resource

`front/lib/resources/workspace_sandbox_env_var_resource.ts`
(per `[BACK11]`, model wears the `Model` suffix, resource does not).

Public interface (no `ModelId`, no model objects per `[BACK4]`):

```ts
class WorkspaceSandboxEnvVarResource {
  // Per [BACK15], Resource methods return Resources, not Types. The
  // endpoint handler maps with .toJSON() to produce
  // WorkspaceSandboxEnvVarType[] for the wire response.
  static listForWorkspace(auth): Promise<WorkspaceSandboxEnvVarResource[]>
  static fetchByName(auth, name): Promise<WorkspaceSandboxEnvVarResource | null>
  static upsert(auth, { name, value, user }): Promise<Result<{ created: boolean }, Error>>
  static deleteByName(auth, name): Promise<Result<void, Error>>

  toJSON(): WorkspaceSandboxEnvVarType

  // Two explicit decrypt helpers — same impl, distinct logger context so
  // we can audit-trace why secrets were materialized.
  static loadEnvForSandboxProvisioning(auth): Promise<Record<string, string>>
  static loadEnvForRedaction(auth): Promise<Record<string, string>>
}
```

These are the only paths that decrypt. The split makes call sites
self-documenting (`provisioning` mounts onto a sandbox, `redaction` is
read-only and used to filter tool I/O before it reaches the model). Each
helper logs `{ workspaceId, useCase: "provision" | "redact", count }` on
each call.

### 3.3 Type interface (frontend-safe)

`front/types/sandbox/env_var.ts`

```ts
export type WorkspaceSandboxEnvVarType = {
  name: string;
  createdAt: number;
  updatedAt: number;
  createdByName: string | null;
  lastUpdatedByName: string | null;
};
// NOTE: never includes value or encryptedValue.
```

`toJSON()` on the Resource produces this shape (per `[BACK15]`).

### 3.4 Encryption

Reuse the helpers in `front/types/shared/utils/encryption.ts` with the same
shape used by `DustAppSecret` (see
`front/pages/api/w/[wId]/dust_app_secrets/index.ts:100`):

```ts
const encryptedValue = encrypt({
  text: value,
  key: owner.sId,           // workspace sId is mixed into the salt
  useCase: "developer_secret",
});

const plaintext = decrypt({
  encrypted: row.encryptedValue,
  key: owner.sId,
  useCase: "developer_secret",
});
```

Algorithm: AES-256-CBC, IV derived from `md5(key)`, key derived from
`sha256(getDeveloperSecretsSecret() + key)`. The plaintext value never
leaves the server; `WorkspaceSandboxEnvVarResource.toJSON()` does not
include it.

## 4. Backend API

All endpoints live under the existing sandbox API namespace, alongside
`egress-policy.ts`.

### 4.1 `front/pages/api/w/[wId]/sandbox/env-vars/index.ts`

| Method | Auth | Behavior |
| --- | --- | --- |
| `GET` | admin | List names + metadata. Body: `{ envVars: WorkspaceSandboxEnvVarType[] }` |
| `POST` | admin | Create or overwrite. Body: `{ name: string, value: string }`. Validates name + value length. Emits `sandbox_env_var.created` or `sandbox_env_var.updated` based on whether row pre-existed. |

Gated by `sandbox_tools` feature flag (matches `egress-policy.ts:50`).

### 4.2 `front/pages/api/w/[wId]/sandbox/env-vars/[name].ts`

| Method | Auth | Behavior |
| --- | --- | --- |
| `DELETE` | admin | Delete by name. 404 if not found. Emits `sandbox_env_var.deleted`. |

Note: `[name]` is **not** a `ModelId` per `[SEC2]`, so this is OK. Name is
validated against the same regex on read to prevent path traversal.

### 4.3 Swagger annotation

Both new endpoint files start with `/** @ignoreswagger */` (line 1),
matching the existing pattern in
`front/pages/api/w/[wId]/sandbox/egress-policy.ts:1`. Sandbox-admin APIs
are private and Dust-only-flag-gated; documenting them in Swagger is not
useful and would require schema entries in
`pages/api/swagger_private_schemas.ts` per `[BACK14]`. Revisit if/when
the feature graduates beyond `dust_only`.

The `lint:swagger-annotations` check enforces that every endpoint has
either `@swagger` or `@ignoreswagger`, so omitting the annotation would
fail CI.

### 4.4 Validation helpers

`front/lib/api/sandbox/env_vars.ts`

```ts
export const ENV_VAR_NAME_REGEX = /^[A-Z][A-Z0-9_]{0,63}$/;
export const MAX_VALUE_BYTES = 32 * 1024; // 32 KiB, measured in UTF-8 bytes
export const MAX_VARS_PER_WORKSPACE = 50;

export function validateEnvVarName(name: string): Result<void, string>;
export function isReservedEnvVarName(name: string): boolean;
export function validateEnvVarValue(value: string): Result<void, string>;
```

`validateEnvVarValue` enforces:

- **non-empty** — empty string is rejected (use `DELETE` to remove).
- **size** — `Buffer.byteLength(value, "utf8") <= MAX_VALUE_BYTES`. Note:
  enforced on bytes, not characters, so a 32 KiB cap is exact regardless
  of whether the value is ASCII or multibyte.
- **no NUL byte** — `value.includes("\u0000")` is rejected.
- **multiline allowed** — LF and CRLF are explicitly permitted (legitimate
  for PEM-encoded keys, JSON service-account blobs, etc.). The UI uses a
  multiline text input.

Returns `Result` per `[ERR1]`. Reserved names produce a user-facing error
message naming the rule that was violated.

### 4.5 Limit semantics

The 50-var cap applies to **creating a new name**, not to overwriting an
existing one:

- `POST` with a name that does not yet exist + workspace already at 50 →
  `400 { error: "limit_reached" }`.
- `POST` with a name that **does** exist (rotation) → succeeds even at the
  cap, since count is unchanged.

This is enforced inside `WorkspaceSandboxEnvVarResource.upsert`: count the
rows for the workspace, then insert if under the cap. **The check is
best-effort, not race-free**: under default `READ COMMITTED` isolation,
two concurrent creates can both observe count = 49, both pass the
`count < 50` check, and both insert — landing the workspace at 51. We
accept this race because:

- the cap is a UI/usage guard, not a security boundary;
- concurrent admin creates on the same workspace are extremely rare in
  practice;
- the next operation in that workspace (any create) will see the true
  count and reject further inserts until rows fall below the cap;
- adding a PG advisory lock or `SELECT ... FOR UPDATE` for this is more
  ceremony than the failure mode warrants.

Document the race with an inline comment in the upsert path so future
readers don't try to "fix" it without understanding the trade-off:

```ts
// Best-effort cap. A concurrent burst of creates from the same workspace
// can land 1-2 rows over MAX_VARS_PER_WORKSPACE under READ COMMITTED.
// Acceptable: cap is a UI guard, not a security boundary.
```

## 5. Sandbox Injection

### 5.1 Merge points

Two call sites in `front/lib/resources/sandbox_resource.ts`:
- Fresh create: lines `355–369`
- Recreate after `deleted`: lines `458–470`

Both currently merge image defaults with system vars
(`DD_API_KEY`, `DD_HOST`, `CONVERSATION_ID`, `WORKSPACE_ID`).

**Precedence (lowest → highest): workspace env → image `runEnv` → system
vars.** Image `runEnv` is treated as infra: an admin must not be able to
shadow it. System vars always win for the same reason. The reserved-prefix
blocklist already filters out infra names, but the merge order enforces it
as defense in depth.

```ts
const workspaceEnv =
  await WorkspaceSandboxEnvVarResource.loadEnvForSandboxProvisioning(auth);

const createResult = await provider.create({
  ...createConfig,
  envVars: {
    ...workspaceEnv,                  // workspace secrets (lowest precedence)
    ...createConfig.envVars,          // image runEnv overrides workspace
    DD_API_KEY: config.getDatadogApiKey() ?? "",
    DD_HOST: "http-intake.logs.datadoghq.eu",
    CONVERSATION_ID: conversation.sId,
    WORKSPACE_ID: auth.getNonNullableWorkspace().sId,
  },
});
```

A small refactor extracts this `envVars` composition into a helper
(`buildSandboxEnvVars(auth, conversation)`) shared between the two call
sites — the duplication is already there pre-existing, so doing this as part
of the same PR keeps `[GEN1]` happy.

### 5.2 Snapshot semantics

Env vars are read at sandbox **create** time. They do **not** propagate to a
running sandbox; rotating a value affects the next sandbox boot in that
conversation (next `getOrCreate`), not the current one. Documented in the UI.

If a tighter SLA is needed later, we can add a
`sandbox.commands.run({ envs: ... })` override in
`front/lib/api/sandbox/providers/e2b.ts:257`, but that is out of scope for v1.

### 5.3 Failure mode

`loadEnvForSandboxProvisioning` is fail-closed: if decryption errors on
any row, the whole sandbox boot returns `Err` rather than silently dropping
the broken var. The error message identifies the offending name so the
admin can delete and re-create. `loadEnvForRedaction` is also fail-closed
— if it errors, the tool result is suppressed (returned as a generic error
to the model) rather than passed through unredacted.

## 6. Agent Disclosure Controls

The agent gets the env vars (it has to — code it runs needs them) but is
told not to reveal them, and **bash-tool output** is filtered before being
shown back to the user / model.

**v1 scope is deliberately narrow:**
- Only the bash/code-exec tool runs the redactor. Other sandbox tools
  (`add_egress_domain`, `dsbx`, etc.) are not instrumented. Bash is the
  only tool whose output is meaningfully derived from the sandbox process
  environment, so it is the only realistic leak vector via tool output.
- Redaction operates on the **final tool result payload** only. The bash
  tool today returns a single non-streaming `CallToolResult`, so a
  final-payload pass sees the same bytes the model and persistence layer
  see. (Implementer must re-verify this property when wiring up the
  redactor; if bash ever moves to token-level streaming, redaction must
  move with it — flagged in §12.)
- **No input-argument scanning** and **no refusal path**. The skill
  instruction is the primary defense against the agent passing values
  back as arguments; we are not policing arg shapes in v1.

### 6.1 Skill instructions

Update the sandbox skill at
`front/lib/resources/skill/code_defined/sandbox.ts` to add a clear rule:

> **Environment variables.** The sandbox may have workspace-configured
> environment variables available to your code (read via `process.env`,
> `os.environ`, etc.). You may **use** them — pass them to APIs,
> authenticate with them, read them in code paths that consume them — but
> you must **never**:
> - print, echo, or `cat` an env var value (no `printenv`, `env`,
>   `echo $FOO`, `print(os.environ["FOO"])`, etc.);
> - include an env var value in any output you emit, log line, error
>   message, or final answer to the user;
> - re-encode (base64, hex, reverse) and emit a value to bypass the
>   above;
> - list the available env var names just to enumerate what's there.
>
> If a user asks for a secret value, refuse and say it is not viewable.
> If you need to confirm a var is set, check `"FOO" in os.environ`
> (boolean only) — never read or print the value.

This instruction is the **primary** defense. The bash-output redactor
(§6.2) is a safety net for accidents — not the enforcement mechanism.

This is added alongside the existing egress instructions so it is
in-context for every code-running session.

### 6.2 Bash-tool output redaction

Best-effort redaction inside the bash tool result handler in
`front/lib/api/actions/servers/sandbox/tools/index.ts` (the function that
builds the tool result from `sandbox.commands.run` output). Other sandbox
tools are out of scope.

#### 6.2.1 Where the hook sits

In the bash handler, **after** the formatted tool output is fully
assembled (including any structured sections appended on top of raw
stdout/stderr — e.g. the bash structured-rendering blocks from PR
#24948), and **before** returning the `content` array to the MCP
wrapper. One pass over the final string content blocks; the redactor
does not see streamed bytes because bash returns a single non-streaming
`CallToolResult`.

If a future change makes bash streaming, this hook becomes incorrect —
called out in §12 as a v2 follow-up to move into the provider layer.

#### 6.2.2 Match-floor algorithm

A value is **eligible for redaction** if and only if all of these hold:

1. `value.length >= 12` — short values produce too many false positives
   on innocent text.
2. `value` is not in `LOW_VALUE_DENYLIST`, a small hardcoded set:
   `{"true", "false", "production", "staging", "development", "admin",
   "root", "localhost"}` plus pure-digit strings and pure-ASCII-letter
   strings under 16 chars.
3. (Optional, second-pass safety net) `value` does not match a common
   English word; we do **not** ship a dictionary in v1, but the denylist
   above covers the obvious cases. Rotation guidance in the UI ("use
   high-entropy random tokens") is the practical defense for the rest.

For values that **fail** the eligibility check, we emit a one-time
`logger.info({ workspaceId, name }, "sandbox env var value not eligible
for output redaction (too short or low-value)")` per workspace per
process lifetime, so admins can be told if they ask why their `password`
value is leaking. (Surfacing this to the admin UI is a v2 candidate.)

#### 6.2.3 Replacement

For each eligible value, substring-replace every occurrence in the final
output with `«redacted: $NAME»`. No regex, no encoding-aware matching —
plain substring. This is intentionally simple; the skill instruction is
the primary defense, this is defense-in-depth for accidents.

#### 6.2.4 Observability

If any replacement happened, emit
`logger.warn({ workspaceId, varNames }, "sandbox bash output contained
env var values; redacted")`. No `redactionOccurred` flag on the tool
result itself — internal MCP handlers return only
`CallToolResult["content"]` with no metadata bag, and threading one
through would require refactoring `ToolHandlerResult` and every internal
MCP wrapper. Observability lives in the log; the model-visible signal is
the inline marker.

#### 6.2.5 Documented limitations

In the warning banner on the admin page (§9.4) and in code comments at
the redactor:

- Defeated by trivial transformations (base64, hex, slicing, reversing,
  splitting across `echo` calls). The skill instruction is the primary
  defense.
- Values under 12 chars and dictionary-like values are not redacted, by
  design, to avoid mangling unrelated bash output.
- Only the bash tool's final output is filtered. Other sandbox tools are
  not instrumented. Out-of-band exfiltration (network calls from inside
  the sandbox, files written to mounted volumes, etc.) is not a concern
  of this feature.

## 7. Audit Logging

Per `[AUDIT3]`, three artifacts per action:

### 7.1 Schemas

`front/admin/audit_log_schemas/sandbox_env_var.created.json`
`front/admin/audit_log_schemas/sandbox_env_var.updated.json`
`front/admin/audit_log_schemas/sandbox_env_var.deleted.json`

Targets: `[{ type: "workspace" }, { type: "sandbox_env_var" }]`.

Metadata (strings only, per `[AUDIT5]`):
- `name`: env var name
- `actor_type`: `"user"` (admin)
- For `updated`: `previously_existed` = `"true"`

**Never** log the value, length, or any hash that could leak entropy.

### 7.2 Action union

Add to `AuditAction` in `front/lib/api/audit/workos_audit.ts`:

```ts
| "sandbox_env_var.created"
| "sandbox_env_var.updated"
| "sandbox_env_var.deleted"
```

### 7.3 Emit sites

Inside the `POST`/`DELETE` handlers, after the mutation succeeds (per
`[AUDIT4]`), `void emitAuditLogEvent({ ... })` with
`getAuditLogContext(auth, req)` (per `[AUDIT6]`) and
`buildWorkspaceTarget(auth.getNonNullableWorkspace())` first (per `[AUDIT7]`).

## 8. SWR Hooks

`front/lib/swr/sandbox.ts` (extending the existing file).

```ts
export function useWorkspaceSandboxEnvVars({ owner, disabled = false })
export function useUpsertWorkspaceSandboxEnvVar({ owner })
export function useDeleteWorkspaceSandboxEnvVar({ owner })
```

Per `[REACT2]`:
- `disabled` honored; `loading` is `false` when disabled.
- Listing returns `emptyArray()` while loading/error.
- Mutation hooks fire `useSendNotification` on success and failure.
- Hooks call `mutate` on the list URL after writes.

## 9. UI

Single page component, two sections, both inside one `Page.Vertical`. All
controls are `@dust-tt/sparkle`.

### 9.1 File moves

- New: `front/components/pages/workspace/developers/SandboxPage.tsx` —
  composes `<NetworkSection />` and `<EnvironmentSection />`.
- Refactor: extract the existing body of `EgressPolicyPage.tsx` into
  `NetworkSection`. Drop `Page.Header`, since the parent renders it.
- New: `EnvironmentSection.tsx` next to it.
- Delete `EgressPolicyPage.tsx` in the same PR (no shim period — see
  §9.2 and §11 for the rationale: feature is gated by the Dust-only
  `sandbox_tools` flag, so the legacy URL has no external consumers).

### 9.2 Routing & nav

The admin UI is a **React SPA**, not Next.js pages — routing lives in
`front-spa/src/app/routes/adminRoutes.tsx`.

**`front-spa/src/app/routes/adminRoutes.tsx`** (around line 37, 114):

- Add a lazy `SandboxPage` import:
  ```ts
  const SandboxPage = withSuspense(
    () => import("@dust-tt/front/components/pages/workspace/developers/SandboxPage"),
    "SandboxPage"
  );
  ```
- Add the new route `{ path: "developers/sandbox", element: <SandboxPage /> }`.
- **Delete the existing `EgressPolicyPage` lazy import and its route
  entry in the same PR.** No redirect needed: the feature is gated by a
  Dust-only feature flag (`sandbox_tools`), so external bookmarks to
  `/developers/egress-policy` don't exist in the wild. Keeping the lazy
  import without a route would fail TS/lint; keeping the route to render
  a `<Navigate>` would orphan the import. Removing both together is the
  cleanest cut.

  (If, later, this feature graduates beyond `dust_only` and the URL
  becomes load-bearing for external users, add an absolute redirect at
  that point: `<Navigate to={\`/w/${owner.sId}/developers/sandbox\`}
  replace />`. Relative `to="../sandbox"` is **not** safe here — React
  Router resolves it against the current route segment, and
  `developers/egress-policy` is registered as a flat path, so `..`
  doesn't land where you'd think.)

**`front/components/navigation/config.ts`**:

- Rename the route key `egress_policy` → `sandbox` and update the two route
  arrays at lines 207 and 324 to `/w/[wId]/developers/sandbox`.
- Update the `href` at line 324 to `${owner.sId}/developers/sandbox` and
  the user-visible label "Network" → "Sandbox".
- Drop the legacy `egress-policy` URL from any route arrays it appears in
  (the legacy route is being deleted in the same PR — see §9.2).

### 9.3 NetworkSection

Identical to current page minus the outer `Page.Header`. No behavior
changes.

### 9.4 EnvironmentSection

Top-level layout:

```
┌─ Page.SectionHeader title="Environment variables"
│   description="Secrets mounted as env vars on every sandbox in this workspace."
│
├─ ContentMessage variant="warning" icon={InformationCircleIcon} size="lg"
│   "These values are mounted as env vars on every sandbox in this
│    workspace. The agent is instructed not to print or echo them, and
│    bash-tool output is redacted on a best-effort basis. This is
│    defense-in-depth, not a guarantee: a determined agent can still
│    leak a value through encoded output, network calls from sandbox
│    code, or short/dictionary-like values that the redactor skips to
│    avoid mangling unrelated text. Use least-privilege, high-entropy
│    credentials and rotate often. Values cannot be viewed after saving
│    — only overwritten or deleted."
│
├─ Button label="Add variable" icon={PlusIcon}  → opens AddDialog
│
└─ List rows (flex + divide-y, mirroring NetworkSection)
    ├─ name (mono font)
    ├─ "Updated <relative>" + author
    ├─ Button icon={TrashIcon} variant="warning" size="mini" → confirm dialog
```

Empty state: `ContentMessage variant="info"` "No environment variables yet."

### 9.5 AddDialog

`Dialog` + `DialogContainer` + `DialogContent` containing:
- `Input` label="Name" with live regex validation; `messageStatus="error"`
  for invalid names. Helper text shows the regex and reserved-prefix list.
- `Input` (multiline / `textarea` if Sparkle exposes one — falls back to
  `Input` with `type="password"` if not) label="Value". Visually masked.
- Footer: Cancel + Save.

If a variable with the same name already exists, the dialog title becomes
"Replace variable" and the Save button reads "Replace". Confirmed via
client-side check against the SWR list (no extra round-trip).

### 9.6 Sparkle components used

Reused from `EgressPolicyPage.tsx` exemplars:

- `Page`, `Page.Vertical`, `Page.Header`, `Page.SectionHeader`
- `Dialog`, `DialogContainer`, `DialogContent`, `DialogHeader`,
  `DialogTitle`, `DialogFooter`
- `Input` (with `messageStatus`)
- `Button` (`variant`, `icon`, `size`, `isLoading`)
- `ContentMessage` (`variant`, `icon`, `size`, `title`)
- `Spinner`, `TrashIcon`, `PlusIcon`, `KeyIcon` (or `LockIcon` for the
  section header), `InformationCircleIcon`

No bespoke Tailwind beyond what `EgressPolicyPage` already uses
(`flex items-center gap-3 py-3` for list rows, `divide-y` between rows).

## 10. Tests

Per `[TEST1]`/`[TEST2]`, functional tests at the endpoint level using
factories.

`front/pages/api/w/[wId]/sandbox/env-vars/index.test.ts`:
- non-admin GET → 403
- non-admin POST → 403
- POST with invalid name → 400 (covers reserved prefixes, regex, leading
  underscore)
- POST creating a new name when workspace already has 50 → 400
  (`limit_reached`)
- POST overwriting an existing name when workspace has 50 → 200 (rotation
  always allowed)
- (Not tested: the documented race window where two concurrent creates
  briefly exceed the cap — accepted trade-off, see §4.5.)
- POST with empty value → 400
- POST with NUL byte in value → 400
- POST with multiline value (PEM-style) → 200 round-trips intact
- POST with > 32 KiB UTF-8 value (verified via `Buffer.byteLength`) → 400
- POST same name twice → 200 with second response indicating overwrite;
  audit emits `created` then `updated`
- value never appears in the GET response or the audit metadata

`front/pages/api/w/[wId]/sandbox/env-vars/[name].test.ts`:
- DELETE existing → 200, row gone
- DELETE missing → 404
- non-admin DELETE → 403

`front/lib/api/sandbox/env_vars.test.ts`:
- `validateEnvVarName` covers each reserved prefix and edge cases
- `isReservedEnvVarName` truth table

`front/lib/resources/workspace_sandbox_env_var_resource.test.ts`:
- round-trip encrypt/decrypt
- `loadEnvForSandboxProvisioning` returns `{}` for an empty workspace
- `loadEnvForRedaction` returns `{}` for an empty workspace
- both helpers are fail-closed: one bad ciphertext fails the whole call
  (assert against both `loadEnvForSandboxProvisioning` and
  `loadEnvForRedaction`)
- both helpers emit the use-case-tagged `logger.info` with the row
  count (covers the audit-trace property called out in §3.2)

Sandbox provisioning test (extend existing):
- workspace env vars present in the env passed to `provider.create` mock
- system vars (`DD_API_KEY`, `CONVERSATION_ID`, `WORKSPACE_ID`) take
  precedence even if a row sneaks past validation

Bash-tool output redaction (extend
`front/lib/api/actions/servers/sandbox/tools/index.test.ts`):
- stdout containing an env var value (≥ 12 chars, not in the denylist)
  is replaced with `«redacted: $NAME»` in the final tool result
- a value embedded in an **appended/structured** section of the
  formatted output (not just raw stdout) is also redacted
- values shorter than 12 chars are **not** redacted (avoid mangling) —
  cover with a value of length 8 and assert no replacement
- denylisted values (`"true"`, `"production"`, `"admin"`, pure digits,
  short alphanumeric) are **not** redacted, even if longer than 12
  chars (denylist wins over length)
- redaction emits one `logger.warn({ workspaceId, varNames }, ...)` per
  bash invocation containing matches; varNames includes only the names
  whose values were actually replaced (no metadata flag on the tool
  result itself — see §6.2.4)
- ineligible-value `logger.info` is emitted at most once per
  (workspaceId, name) per process lifetime (covers the "your value is
  too short to redact" telemetry path)

## 11. Migration / Rollout

1. Generate `migration_N.sql` via `./front/create_db_migration_file.sh` and
   register the model in `front/admin/db.ts`. Migration is additive, no
   backfill.
2. Ship backend (resource, API, audit, sandbox merge, redaction) behind
   the existing `sandbox_tools` flag.
3. Ship frontend (renamed page + new section) and SPA route changes
   behind the same flag — including deletion of the legacy
   `EgressPolicyPage` lazy import, the `developers/egress-policy` route,
   and `EgressPolicyPage.tsx`. No redirect cycle is needed because the
   feature is currently gated by a Dust-only flag, so the legacy URL has
   no external consumers.

No data migration is required — existing workspaces simply have zero env
vars on day one.

## 12. Out of Scope (v2 candidates)

- Bulk paste `.env` import on create.
- Per-agent or per-conversation scoped env vars.
- Extending the redactor beyond the bash tool (other sandbox tools).
- Stream-time redaction at the provider layer (`sandbox.commands.run`
  byte stream) — required if/when the bash tool moves to token-level
  streaming.
- Input-argument scanning + refusal path (catch the agent passing a
  value verbatim back as a tool arg).
- Encoding-aware redaction (decode obvious base64/hex strings before
  matching).
- Surfacing "your value is too short / too dictionary-like to be
  redacted" warnings into the admin UI on create.
- Listing the available env var names in the system prompt to the
  agent (deferred — currently the agent learns about a var only when it
  references one explicitly in code).
- Hot-rotation: pushing env updates into already-running sandboxes via
  `sandbox.commands.run({ envs })` overrides.
- Read-once "reveal value" UX (deliberately omitted to keep the
  write-only contract simple).
- A CLI/SDK to manage env vars outside the admin UI.

## 13. File Touch List (summary)

**New files**
- `front/migrations/db/migration_N.sql` — generated via
  `./front/create_db_migration_file.sh`; creates the
  `workspace_sandbox_env_vars` table with `(workspaceId, name)` unique
  index plus FK indexes.
- `front/lib/resources/storage/models/workspace_sandbox_env_var.ts` —
  Sequelize model (matches existing `models/` location).
- `front/lib/resources/workspace_sandbox_env_var_resource.ts` — Resource
  with `upsert`, `deleteByName`, `loadEnvForSandboxProvisioning`,
  `loadEnvForRedaction`.
- `front/types/sandbox/env_var.ts` — `WorkspaceSandboxEnvVarType` (no
  value).
- `front/lib/api/sandbox/env_vars.ts` — name + value validation.
- `front/pages/api/w/[wId]/sandbox/env-vars/index.ts` — GET + POST.
- `front/pages/api/w/[wId]/sandbox/env-vars/[name].ts` — DELETE.
- `front/admin/audit_log_schemas/sandbox_env_var.created.json`
- `front/admin/audit_log_schemas/sandbox_env_var.updated.json`
- `front/admin/audit_log_schemas/sandbox_env_var.deleted.json`
- `front/components/pages/workspace/developers/SandboxPage.tsx`
- `front/components/pages/workspace/developers/sections/NetworkSection.tsx`
- `front/components/pages/workspace/developers/sections/EnvironmentSection.tsx`
- Tests as listed in §10.

**Modified**
- `front-spa/src/app/routes/adminRoutes.tsx` — add `SandboxPage` lazy
  import + route, **delete** the `EgressPolicyPage` lazy import and its
  `developers/egress-policy` route entry (same PR). See §9.2 for why no
  redirect is needed (Dust-only feature flag).
- `front/components/navigation/config.ts` — rename key, label, and href
  (`egress_policy` → `sandbox`); remove the legacy `egress-policy` URL
  entry.
- `front/admin/db.ts` — register the new `WorkspaceSandboxEnvVarModel`
  import (around line 127).
- `front/lib/resources/sandbox_resource.ts` — merge `workspaceEnv` at
  the two `provider.create` sites (lines 355–369 and 458–470); extract
  a shared `buildSandboxEnvVars(auth, conversation)` helper.
- `front/lib/swr/sandbox.ts` — add three hooks
  (`useWorkspaceSandboxEnvVars`, `useUpsertWorkspaceSandboxEnvVar`,
  `useDeleteWorkspaceSandboxEnvVar`).
- `front/lib/api/audit/workos_audit.ts` — extend `AuditAction` union
  with `sandbox_env_var.{created,updated,deleted}`.
- `front/lib/resources/skill/code_defined/sandbox.ts` — add the env-var
  disclosure-control instructions per §6.1.
- `front/lib/api/actions/servers/sandbox/tools/index.ts` — bash-tool
  output redaction only, per §6.2. No input-arg scanning, no refusal
  path, no changes to other sandbox tools.

**Deleted**
- `front/components/pages/workspace/developers/EgressPolicyPage.tsx` —
  body moved into `NetworkSection`; the file itself is removed in the
  same PR (no shim period needed under the Dust-only flag).

