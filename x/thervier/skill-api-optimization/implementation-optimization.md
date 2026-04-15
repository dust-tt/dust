# Skills API — Performance Analysis & Optimization Plan

## Context

The skills API endpoint is slow when a workspace has many custom skills with MCP server views.
The bottleneck was traced to `SkillResource.baseFetch` in
`front/lib/resources/skill/skill_resource.ts`, specifically the call at line 637:

```ts
const allMCPServerViews = await MCPServerViewResource.fetchByModelIds(
  auth,
  removeNulls(mcpServerConfigurations.map((c) => c.mcpServerViewId)),
  { includeMetadata: false }
);
```

This call looks like a single batched fetch but triggers a cascade of hidden SQL queries.

---

## Issue 1 — N+1 in `InternalMCPServerInMemoryResource.fetchByIds` (main culprit)

**Severity: High**

### What happens

`MCPServerViewResource.fetchByModelIds` calls `MCPServerViewResource.baseFetch`
([mcp_server_view_resource.ts:352](../../front/lib/resources/mcp_server_view_resource.ts#L352)),
which calls `InternalMCPServerInMemoryResource.fetchByIds`
([internal_mcp_server_in_memory_resource.ts:281](../../front/lib/resources/internal_mcp_server_in_memory_resource.ts#L281)):

```ts
const resources = await concurrentExecutor(
  validIds,
  (id) => InternalMCPServerInMemoryResource.init(auth, id),  // called once per ID
  { concurrency: 10 }
);
```

Each `init` call fires `fetchDecryptedCredentials` → `InternalMCPServerCredentialModel.findOne`
([internal_mcp_server_in_memory_resource.ts:503](../../front/lib/resources/internal_mcp_server_in_memory_resource.ts#L503)):

```ts
const credential = await InternalMCPServerCredentialModel.findOne({
  where: {
    workspaceId: auth.getNonNullableWorkspace().id,
    internalMCPServerId,   // one query per server
  },
});
```

With K distinct internal MCP server IDs across all custom skills, this produces **K individual
SQL queries** — a classic N+1.

### Fix

Introduce a `fetchDecryptedCredentialsBatch` static method that fetches all credentials in
a single `WHERE internalMCPServerId IN (...)` query. Refactor `fetchByIds` to call this once
and pass the results into `init` (or a new `initWithCredential` variant).

```ts
// Proposed batch method on InternalMCPServerInMemoryResource
static async fetchByIds(auth, ids, systemSpace) {
  // ... existing filter for validIds / manualIds ...

  // Single batch fetch instead of N findOne calls
  const credentials = await InternalMCPServerCredentialModel.findAll({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      internalMCPServerId: { [Op.in]: validIds },
    },
  });
  const credentialMap = new Map(credentials.map(c => [c.internalMCPServerId, c]));

  const resources = await concurrentExecutor(
    validIds,
    (id) => InternalMCPServerInMemoryResource.initWithCredential(auth, id, credentialMap.get(id)),
    { concurrency: 10 }
  );

  return removeNulls(resources);
}
```

**Expected impact**: reduces K SQL queries to 1 for the credential fetch step.

---

## Issue 2 — O(n²) in views-to-skills mapping

**Severity: Medium**

### What happens

At lines 643–653 of `skill_resource.ts`, for each custom skill the code scans all fetched views
using `.filter` + `.includes`:

```ts
allowedCustomSkillsRes = allowedCustomSkills.map((customSkill) => {
  const skillMCPServerViewIds = skillMCPServerConfigsBySkillId[customSkill.id]
    ?.map((skillConfig) => skillConfig.mcpServerViewId);

  const skillMCPServerViews = allMCPServerViews.filter((view) =>
    skillMCPServerViewIds?.includes(view.id)   // O(M) per view in allMCPServerViews
  );
  ...
});
```

For S skills, V total views, and M view IDs per skill: **O(S × V × M)**.

### Fix

Build a `Map<viewId, MCPServerViewResource>` from `allMCPServerViews` once, then do direct
lookups per skill:

```ts
const mcpServerViewById = new Map(allMCPServerViews.map((v) => [v.id, v]));

allowedCustomSkillsRes = allowedCustomSkills.map((customSkill) => {
  const skillMCPServerViewIds = skillMCPServerConfigsBySkillId[customSkill.id]
    ?.map((skillConfig) => skillConfig.mcpServerViewId) ?? [];

  const skillMCPServerViews = removeNulls(
    skillMCPServerViewIds.map((id) => mcpServerViewById.get(id) ?? null)
  );
  ...
});
```

**Expected impact**: reduces complexity to O(S × M) total — linear in the number of
(skill, view) associations.

---

## Issue 3 — O(n²) in editor groups map building

**Severity: Low–Medium**

### What happens

At lines 623–634 of `skill_resource.ts`, a `.find` call inside a loop makes group lookup
quadratic in the number of editor group associations × number of groups:

```ts
for (const editorGroupSkill of editorGroupSkills) {
  const group = editorGroups.find(   // O(G) per iteration
    (g) => g.id === editorGroupSkill.groupId
  );
  if (group) {
    skillEditorGroupsMap.set(editorGroupSkill.skillConfigurationId, group);
  }
}
```

For E group-skill associations and G groups: **O(E × G)**.

### Fix

Build a `Map` from the groups array before the loop:

```ts
const editorGroupsById = new Map(editorGroups.map((g) => [g.id, g]));

for (const editorGroupSkill of editorGroupSkills) {
  const group = editorGroupsById.get(editorGroupSkill.groupId);
  if (group) {
    skillEditorGroupsMap.set(editorGroupSkill.skillConfigurationId, group);
  }
}
```

**Expected impact**: reduces to O(E + G) total — effectively linear.

---

## Issue 4 — `SpaceResource.fetchWorkspaceSystemSpace` called inside every `baseFetch`

**Severity: Low (custom skills path) / High (global skills path)**

### What happens

`MCPServerViewResource.baseFetch` always fetches the system space from the database
([mcp_server_view_resource.ts:379](../../front/lib/resources/mcp_server_view_resource.ts#L379)).
In the custom skills path this is called once, so it adds 1 SQL query — acceptable.

However, in the **global skills path** (`fromGlobalSkill` at line 1390), for each global skill
definition × each `def.mcpServers` entry, `listMCPServerViewsAutoInternalForSpaces` →
`listByMCPServer` → `baseFetch` is called independently. With G global skills × M mcp servers
each, this produces **G × M full `baseFetch` cascades**, each with their own system-space fetch,
remote-server fetch, and internal-server N+1.

### Fix (custom path)

No action needed — the system space is fetched once.

### Fix (global path)

Refactor `fromGlobalSkill` to accept pre-fetched data (system space, available views) and avoid
redundant `baseFetch` calls. Alternatively, hoist the `listMCPServerViewsAutoInternalForSpaces`
calls out of `fromGlobalSkill` and batch them at the `baseFetch` level, similar to how
`allMCPServerViews` is already batched for custom skills.

---

## Tasks

- [x] **[Issue 1]** Batch-fetch credentials in `InternalMCPServerInMemoryResource.fetchByIds` — single `WHERE internalMCPServerId IN (...)` instead of K individual `findOne` calls.
- [ ] **[Issue 2]** Build `mcpServerViewById: Map<id, MCPServerViewResource>` before the `allowedCustomSkills.map` loop and replace `.filter`+`.includes` with direct `Map.get` lookups.
- [ ] **[Issue 3]** Build `editorGroupsById: Map<id, Group>` before the `editorGroupSkills` loop and replace `.find` with `Map.get`.

**Issue 4 — Global skills `baseFetch` cascade (won't fix for now):** we currently have very few global skills, so the G × M `baseFetch` cascade has negligible real-world impact. Revisit if the number of global skills grows significantly.
