# Sandbox Environment Manager — Split Plan

Reference (full design): `sandbox-env-manager.md`.
Reference (full implementation): PR #25013 on `env-manager-sandbox-pr1` (will be closed; kept as reference).

All PRs land behind the existing `sandbox_tools` feature flag. Until PR 4 lands, none of this is reachable from the UI.

## Order & dependency graph

```
PR 1 (model + migration)
   │
   ▼
PR 2 (resource + validation + types)
   │
   ├─► PR 3 (API + audit) ──► PR 4 (UI + rename)
   ├─► PR 5 (sandbox injection)
   └─► PR 6 (disclosure + redaction)
```

PRs 3, 5, 6 only depend on PR 2 — they can land in any order once PR 2 is merged.
PR 4 depends on PR 3 (needs the API to be wired).

---

## PR 1 — DB model + migration

**Goal:** create the `workspace_sandbox_env_vars` table and Sequelize model. Nothing reads or writes it yet.

**Files (new):**
- `front/migrations/db/migration_N.sql` — generated via `./front/create_db_migration_file.sh`. Creates the table with:
  - columns: `id`, `createdAt`, `updatedAt`, `workspaceId`, `name`, `encryptedValue` (TEXT), `createdByUserId` (nullable), `lastUpdatedByUserId` (nullable)
  - unique index on `(workspaceId, name)`
  - explicit indexes on `workspaceId`, `createdByUserId`, `lastUpdatedByUserId` (per `[BACK13]`)
- `front/lib/resources/storage/models/workspace_sandbox_env_var.ts` — `WorkspaceSandboxEnvVarModel extends WorkspaceAwareModel`, matches schema.

**Files (modified):**
- `front/admin/db.ts` — register the new model so `init_db.sh` picks it up.

**Tests:** none (no behavior yet — model registration is exercised by `init_db.sh` running clean).

**Out of scope for this PR:** Resource class, validation, encryption helpers, API, UI.

**Review focus:** column types, FK definitions, index choices, migration idempotency.

---

## PR 2 — Resource + validation + frontend-safe types

**Goal:** all the server-side logic to read/write env vars, with encryption. Still no API surface.

**Files (new):**
- `front/lib/resources/workspace_sandbox_env_var_resource.ts` — `WorkspaceSandboxEnvVarResource` with:
  - `listForWorkspace(auth)`
  - `fetchByName(auth, name)`
  - `upsert(auth, { name, value, user })` returning `Result<{ created: boolean }, Error>` (best-effort 50-cap, race comment per §4.5 of the design doc)
  - `deleteByName(auth, name)`
  - `toJSON()` → `WorkspaceSandboxEnvVarType`
  - `loadEnvForSandboxProvisioning(auth)` and `loadEnvForRedaction(auth)` — two distinct decrypt paths, each logging `{ workspaceId, useCase, count }`. Fail-closed on decrypt error.
- `front/lib/resources/workspace_sandbox_env_var_resource.test.ts` — round-trip encrypt/decrypt; both load helpers return `{}` on empty workspace; both fail-closed on bad ciphertext; both emit use-case-tagged `logger.info` with row count.
- `front/lib/api/sandbox/env_vars.ts` — `ENV_VAR_NAME_REGEX`, `MAX_VALUE_BYTES`, `MAX_VARS_PER_WORKSPACE`, `validateEnvVarName`, `isReservedEnvVarName`, `validateEnvVarValue`. Reserved-prefix blocklist per §2.1.
- `front/lib/api/sandbox/env_vars.test.ts` — covers each reserved prefix, regex edges, value validation (empty, NUL, byte-length cap, multiline allowed).
- `front/types/sandbox/env_var.ts` — `WorkspaceSandboxEnvVarType` (no value, no encryptedValue).

**Files (modified):** none.

**Out of scope:** API endpoints, audit, sandbox boot, UI, redaction.

**Review focus:** encryption call shape (matches `DustAppSecret`), `Result<>` patterns per `[ERR1]`, `loadEnvFor*` split rationale, fail-closed semantics.

---

## PR 3 — API endpoints + audit

**Goal:** admin REST API for managing env vars, with audit log emissions. Behind `sandbox_tools` flag (admin-only).

**Files (new):**
- `front/pages/api/w/[wId]/sandbox/env-vars/index.ts` — `GET` (list) + `POST` (create/overwrite). Starts with `/** @ignoreswagger */`. Emits `sandbox_env_var.created` or `sandbox_env_var.updated` after mutation.
- `front/pages/api/w/[wId]/sandbox/env-vars/[name].ts` — `DELETE`. `/** @ignoreswagger */`. Emits `sandbox_env_var.deleted`. Validates `name` against the regex on read to prevent path traversal.
- `front/pages/api/w/[wId]/sandbox/env-vars/index.test.ts` — full coverage from §10: 403s, regex/reserved 400s, 50-cap, rotation at cap, empty/NUL/oversize/multiline value, value never appears in GET or audit.
- `front/pages/api/w/[wId]/sandbox/env-vars/delete.test.ts` — DELETE existing/missing/non-admin.
- `front/admin/audit_log_schemas/sandbox_env_var.created.json`
- `front/admin/audit_log_schemas/sandbox_env_var.updated.json`
- `front/admin/audit_log_schemas/sandbox_env_var.deleted.json`

**Files (modified):**
- `front/lib/api/audit/workos_audit.ts` — extend `AuditAction` union with the three new actions.

**Out of scope:** UI, sandbox boot wiring, redaction.

**Review focus:** auth gates (admin + `sandbox_tools` flag), audit emission per `[AUDIT4]`/`[AUDIT6]`/`[AUDIT7]`, that audit metadata never contains the value or any length/hash leak.

---

## PR 4 — UI: page rename + Environment section + SWR hooks

**Goal:** rename the existing Network admin page to Sandbox and add the Environment section that talks to PR 3's API. This is the user-facing turn-on.

**Files (new):**
- `front/components/pages/workspace/developers/SandboxPage.tsx` — composes `<NetworkSection />` and `<EnvironmentSection />` inside a single `Page.Vertical`.
- `front/components/pages/workspace/developers/sections/NetworkSection.tsx` — extracted body of `EgressPolicyPage`, minus the outer `Page.Header`.
- `front/components/pages/workspace/developers/sections/EnvironmentSection.tsx` — section header, warning `ContentMessage` (text per §9.4), Add button, list rows (name, "Updated <relative>" + author, delete button), empty state, `AddDialog` (with rotation/Replace flow).

**Files (modified):**
- `front/lib/swr/sandbox.ts` — add `useWorkspaceSandboxEnvVars`, `useUpsertWorkspaceSandboxEnvVar`, `useDeleteWorkspaceSandboxEnvVar` per `[REACT2]`.
- `front-spa/src/app/routes/adminRoutes.tsx` — add `SandboxPage` lazy import + `developers/sandbox` route; **delete** the `EgressPolicyPage` import and `developers/egress-policy` route entry (no redirect — feature is Dust-only-flag-gated).
- `front/components/navigation/config.ts` — rename `egress_policy` key to `sandbox`, update href to `${owner.sId}/developers/sandbox`, label "Network" → "Sandbox", drop the legacy URL from any route arrays.

**Files (deleted):**
- `front/components/pages/workspace/developers/EgressPolicyPage.tsx` — body lives in `NetworkSection` now.

**Out of scope:** sandbox boot injection (PR 5), redaction (PR 6). Without those, admins can save env vars but they have no effect at runtime — that's intentional, the flag gates real exposure.

**Review focus:** routing change is clean (no orphaned imports), Sparkle component reuse, write-only contract preserved (no value ever rendered after save), warning banner reflects current limitations honestly.

> Manual test: with `sandbox_tools` enabled, navigate to `/w/[wId]/developers/sandbox`, create / overwrite / delete a var; confirm the legacy `/developers/egress-policy` URL 404s; confirm value is not visible after save.

---

## PR 5 — Sandbox injection at boot

**Goal:** wire workspace env vars into the sandbox process environment at create time.

**Files (modified):**
- `front/lib/resources/sandbox_resource.ts` — extract `buildSandboxEnvVars(auth, conversation)` helper. Apply at both call sites (lines ~355–369 and ~458–470). Precedence (lowest → highest): workspace env → image `runEnv` → system vars (`DD_API_KEY`, `DD_HOST`, `CONVERSATION_ID`, `WORKSPACE_ID`).
- `front/lib/resources/sandbox_resource.test.ts` — workspace env vars present in `provider.create` mock; system vars take precedence even if a row sneaks past validation.

**Out of scope:** UI, redaction, skill instructions.

**Review focus:** precedence order is correct (defense in depth on top of the reserved-prefix blocklist), helper de-dups the two existing call sites cleanly, fail-closed on decrypt error from `loadEnvForSandboxProvisioning` (whole sandbox boot returns `Err`).

> Manual test: create an env var via PR 4's UI; trigger a fresh sandbox in a conversation; confirm via the bash tool that `"FOO" in os.environ` is `True`. (Don't print the value during testing — that's exactly what PR 6 is about.)

---

## PR 6 — Agent disclosure controls (skill instructions + bash redaction)

**Goal:** instruct the agent not to reveal env var values, and add the best-effort bash-tool output redactor as a safety net.

**Files (modified):**
- `front/lib/resources/skill/code_defined/sandbox.ts` — append the disclosure-control instructions per §6.1 (use values, never print/echo/cat/encode/list, refuse on user request, use boolean `in os.environ` only).
- `front/lib/api/actions/servers/sandbox/tools/index.ts` — bash-tool final-payload redactor per §6.2:
  - Hook sits after the formatted tool output is fully assembled, before returning content blocks to the MCP wrapper.
  - Match-floor: `value.length >= 12`, not in `LOW_VALUE_DENYLIST`, plus pure-digit / short-alphanumeric exclusions.
  - Replacement: substring-replace each occurrence with `«redacted: $NAME»`.
  - Observability: `logger.warn({ workspaceId, varNames }, ...)` on any replacement; one-time-per-process `logger.info` for ineligible values.
  - Fail-closed: if `loadEnvForRedaction` errors, suppress the tool result.
- `front/lib/api/actions/servers/sandbox/tools/index.test.ts` — full coverage from §10:
  - eligible value in stdout → redacted
  - eligible value in appended structured section → redacted
  - sub-12-char value → not redacted
  - denylisted values (`"true"`, `"production"`, `"admin"`, pure digits, short alphanumeric) → not redacted
  - one `logger.warn` per bash invocation with matching `varNames`
  - ineligible-value `logger.info` emitted at most once per `(workspaceId, name)` per process

**Out of scope:** input-arg scanning, refusal path, redactor for non-bash sandbox tools, stream-time redaction (all flagged as v2 in §12 of the design doc).

**Review focus:** redactor sits at the documented seam (final-payload, single-pass), denylist is conservative, log lines never include the value, comment explicitly notes the streaming-bash invariant so a future change to streaming forces a redactor relocation.

> Manual test: with an env var configured, ask the agent to `echo $FOO` via bash; confirm the output is replaced with `«redacted: FOO»` and a `logger.warn` is emitted.

---

## Notes

- **Plan doc location:** ship `front/docs/plans/sandbox-env-manager.md` with PR 1 or PR 2 as the canonical reference. (PR 1 is fine — it's the first thing reviewers will look for.)
- **No flag changes:** every PR rides on the existing `sandbox_tools` flag. No new flag introduced.
- **Branch naming suggestion:** `sbx-env/01-model`, `sbx-env/02-resource`, `sbx-env/03-api`, `sbx-env/04-ui`, `sbx-env/05-injection`, `sbx-env/06-redaction`.
- **Close PR #25013** once PR 1 is up — keep the branch around as `env-manager-sandbox-pr1` for reference until PR 6 ships.
