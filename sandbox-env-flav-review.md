# Sandbox env vars — Flavien review follow-ups

Branch: `sbx-env/flav-review` (rebased on latest `main`).

This file consolidates Flavien's inline review comments from
[#25015](https://github.com/dust-tt/dust/pull/25015) (DB model),
[#25016](https://github.com/dust-tt/dust/pull/25016) (data layer) and
[#25017](https://github.com/dust-tt/dust/pull/25017) (API + audit), all merged.

Each item is grouped by file/concern, not by PR, so the work can be split into
sensible follow-up commits.

---

## 1. Sequelize model — `front/lib/resources/storage/models/workspace_sandbox_env_var.ts`

### 1.1 Drop the `Workspace` prefix from the model name
- [PR #25015 line 7](https://github.com/dust-tt/dust/pull/25015#discussion_r3166211877)
- > nit do we need the Workspace prefix here? By default all models are workspace scope, right?
- **Action:** rename `WorkspaceSandboxEnvVarModel` → `SandboxEnvVarModel`. File rename
  to `front/lib/resources/storage/models/sandbox_env_var.ts`. Propagate to:
  - `front/admin/db.ts` registration
  - the resource class (see §2.1)
  - any imports / tests
  - audit/log strings stay as-is (`sandbox_env_var.*` already matches)

### 1.2 Drop the explicit `references` blocks on FK columns
- [PR #25015 line 41](https://github.com/dust-tt/dust/pull/25015#discussion_r3166215807)
- > You should not need this, if you use the belongsTo and hasOne relationship below.
- **Action:** remove the `references: { model: UserModel, key: "id" }` from
  `createdByUserId` and `lastUpdatedByUserId` in `Model.init`. The `belongsTo`
  calls at the bottom of the file already declare the FK.

### 1.3 Drop the redundant single-column `workspaceId` index
- [PR #25015 line 68](https://github.com/dust-tt/dust/pull/25015#discussion_r3166218549)
- > No need for this one, querying with workspaceId only will use the composite index from above.
- **Action:** remove the `workspace_sandbox_env_vars_workspace_id_idx` entry.
  The existing `(workspaceId, name)` unique index already serves
  workspaceId-only lookups via leftmost-prefix matching.

### 1.4 Drop the user-FK indexes
- [PR #25015 line 72](https://github.com/dust-tt/dust/pull/25015#discussion_r3166223046)
- > Do we plan to query by createdByUserId and lastUpdatedByUserId? If no, then we can remove those, cause the join on userId won't leverage those.
- **Action:** remove `workspace_sandbox_env_vars_created_by_user_id_idx` and
  `workspace_sandbox_env_vars_last_updated_by_user_id_idx`. We never query by
  these columns, and joins via `belongsTo(UserModel)` are by `users.id` so they
  don't use these indexes.

### 1.5 Migration to drop the indexes
- The four index drops in 1.3 + 1.4 require a follow-up SQL migration:
  `DROP INDEX CONCURRENTLY IF EXISTS workspace_sandbox_env_vars_workspace_id_idx;`
  (× 3 names)

---

## 2. Resource layout

> **§2.1 dropped.** We considered folding env-var methods into `SandboxResource`,
> but env vars are workspace-scoped, not per-sandbox — folding would muddle
> ownership boundaries. The standalone `WorkspaceSandboxEnvVarResource` stays.

### 2.2 Read the user from `auth` instead of taking it as a parameter ✅ done
- [PR #25016 line 101](https://github.com/dust-tt/dust/pull/25016#discussion_r3166243120)
- > Can't we use the user directly from auth?
- Dropped the `user: UserResource` arg from `upsert(...)`; method now reads the
  user via `auth.getNonNullableUser()`. All call sites updated.

### 2.3 Don't use `Model.upsert` ✅ done
- [PR #25016 line 146](https://github.com/dust-tt/dust/pull/25016#discussion_r3166255887)
- > Can we avoid upsert if we know that the env var already exists? Using upsert consumes/advances the sequence, even when it ends up performing an UPDATE. Sequelize translates it to: `INSERT ... ON CONFLICT (...) DO UPDATE SET ...`
- `upsert` now branches on the already-fetched `existing` row: `Model.create`
  on the new path, `existing.update({ encryptedValue, lastUpdatedByUserId })`
  on the replace path. No more `Model.upsert`.

### 2.4 Delete by id, not by name ✅ done (resource side)
- [PR #25016 line 157](https://github.com/dust-tt/dust/pull/25016#discussion_r3166257845)
- > This feels weird, why not deleting by id?
- Dropped `static deleteByName`. Added `static fetchById(auth, id)` for the
  upcoming §3.1 endpoint switch. The `[name].ts` endpoint now does
  `fetchByName` → `.delete(auth)` (instance delete, keyed on id) — URL change
  to `[id].ts` is §3.1.

### 2.5 `loadEnv` should reuse `baseFetch` / `listByWorkspace` ✅ done
- [PR #25016 line 202](https://github.com/dust-tt/dust/pull/25016#discussion_r3166260777)
- > Why not use baseFetch or listByWorkspace?
- `loadEnv` now calls `baseFetch(auth)` and iterates over the resources,
  decrypting via `resource.encryptedValue`. The bespoke `findAll(...)` is gone
  and the workspace-scoping logic lives in one place.

---

## 3. API endpoints

### 3.1 Route by id, not name ✅ done
- [PR #25017 line 63](https://github.com/dust-tt/dust/pull/25017#discussion_r3166269088)
- > Why not deleting by id instead of name, like we usually do? It means we will have to url encode var names on client side before doing the call.
- Added `sandbox_env_var: "sev"` prefix in `string_ids.ts`; added `sId` getter
  on the resource and `sId` field on `WorkspaceSandboxEnvVarType`. Renamed
  `[name].ts` → `[id].ts`; handler parses the sId via `getResourceIdFromSId`
  and calls `fetchById` → `.delete(auth)`. SWR delete hook now hits
  `/sandbox/env-vars/${envVar.sId}` (no more `encodeURIComponent(name)`).

### 3.2 Move audit-log emit into the resource ✅ done
- [PR #25017 line 90](https://github.com/dust-tt/dust/pull/25017#discussion_r3166271095) (DELETE)
- [PR #25017 line 124](https://github.com/dust-tt/dust/pull/25017#discussion_r3166284960) (POST)
- > IMHO, this should be bundled in the resource itself so we always capture it. / Can we also move this to the resource.
- `upsert` and the `delete` instance method now emit
  `sandbox_env_var.{created,updated,deleted}` themselves; both accept an
  optional `context?: AuditLogContext` arg that endpoints populate via
  `getAuditLogContext(auth, req)` (so the `x-forwarded-for` IP is preserved
  per `[AUDIT6]`). Endpoints no longer call `emitAuditLogEvent` directly.

### 3.3 Validate the POST body with Zod ✅ done
- [PR #25017 line 73](https://github.com/dust-tt/dust/pull/25017#discussion_r3166283622)
- > Can we use zod to validate the body?
- Added `PostWorkspaceSandboxEnvVarBodySchema = z.object({ name, value })` in
  `front/lib/api/sandbox/env_vars.ts`. Endpoint now uses `safeParse` and
  formats parse issues into the 400 error message. Deep validation
  (`validateEnvVarName` / `validateEnvVarValue`) stays inside the resource
  and is not duplicated in the endpoint.

### 3.4 POST should return the created/updated resource ✅ done
- [PR #25017 line 26](https://github.com/dust-tt/dust/pull/25017#discussion_r3166281788)
- > nit Proper POST usually either return 201 or return the resource that was just created. Returning the resource is more useful as you can leverage it to do optimistic update directly on the client side.
- `upsert` now returns `Result<{ resource, created }, Error>`. POST handler
  returns `{ envVar: resource.toJSON(), created }` with 201 on create / 200
  on update. `PostWorkspaceSandboxEnvVarsResponseBody` updated; SWR upsert
  hook unchanged in shape (still triggers a refetch — optimistic mutate is
  a follow-up if needed).

---

## 4. Naming policy / reserved prefixes

### 4.1 Switch from a denylist to a single user prefix ✅ done
- [PR #25016 line 7](https://github.com/dust-tt/dust/pull/25016#discussion_r3166237953)
- > How confident are we that we are capturing the full list here? Just wondering if it would not have been easier if we would prefix all workspace/user env vars like Terraform does (TF_VARS_). WDYT?
- Decision: enforce a single reserved prefix `DST_`. Names must match
  `^DST_[A-Z][A-Z0-9_]{0,59}$` (64 chars total). The denylist
  (`RESERVED_EXACT_NAMES`, `RESERVED_PREFIXES`, `isReservedEnvVarName`) is gone.
- UI: the form shows `DST_` as a non-editable prefix tag next to the input;
  the user types only the suffix (`OPENAI_API_KEY` etc.), and the suffix is
  validated client-side via a separate `ENV_VAR_NAME_SUFFIX_REGEX`. On submit
  the client prepends `DST_`; on replace the client strips `DST_` from the
  existing name. The list view still shows the full `DST_*` name.
- Trade-off accepted: SDKs that look for `OPENAI_API_KEY` won't pick up
  `DST_OPENAI_API_KEY` automatically — user code reads `$DST_OPENAI_API_KEY`.
  In exchange we no longer have to track which runtime prefixes exist or
  worry about forgetting one when we add a new system env var.

---

## 5. Tests

### 5.1 Hoist the audit-log mock to the global vitest setup
- [PR #25017 line 9](https://github.com/dust-tt/dust/pull/25017#discussion_r3166276258)
- > Might be good to just move it to the global vite config so we don't mock it everywhere.
- **Action:** add the `vi.mock("@app/lib/api/audit/workos_audit", ...)` block
  (with `mockEmitAuditLogEvent`) to `front/vite.globalSetup.ts` (or the
  closest test setup file used by vitest). Remove the per-file
  `vi.hoisted(...)` + `vi.mock(...)` declarations from
  `pages/api/w/[wId]/sandbox/env-vars/index.test.ts` (and any other test we
  added that mocks it). Confirm the existing tests that *assert* on
  `mockEmitAuditLogEvent` still have a way to import the spy from the global
  setup.

### 5.2 Update the env-var endpoint tests
- After §2 / §3, the tests need to:
  - target `/sandbox/env-vars/[id]` for DELETE
  - assert on the new POST response shape (`envVar` field, 201/200)
  - keep using `WorkspaceSandboxEnvVarResource.upsert` (now
    `SandboxResource.upsertEnvVar`) for fixture seeding (per [TEST5])

---

## 6. Suggested commit order

Each step keeps the build green on its own.

1. **Drop redundant model bits** (§1.2, §1.3, §1.4) + matching index-drop
   migration. Smallest possible change, no semantic shift.
2. **Rename model class + file** (§1.1). Pure rename, propagates to db.ts,
   resource, scrub activity, tests.
3. **Refactor resource: get user from auth, drop `Model.upsert`, delete by
   id, loadEnv via baseFetch** (§2.2, §2.3, §2.4, §2.5). ✅ done
4. **Switch DELETE endpoint to id-based routing** (§3.1) + SWR hook + types. ✅ done
5. **Move audit-log emit into the resource** (§3.2). ✅ done
6. **Zod-validate POST body** (§3.3). ✅ done
7. **Return the resource from POST** (§3.4) + SWR upsert hook + tests. ✅ done
8. **Hoist audit-log mock to global setup** (§5.1).
9. **Naming policy decision** (§4.1) — DST_ prefix enforced. ✅ done

Items 1–8 are mechanical.
