# Admin Governance - Agent Migration

This plan migrates workspace-agent editor permissions from the `agent_editors` group kind and
`group_agents` join table to the `regular_auto` group kind and `group_permissions` table.

Each numbered item is one PR, except PR 11's three parts. The 300-line target is a soft bound: combine
related changes when an intermediate state has no review or operational value. Split at real deploy,
backfill, observation, or rollback boundaries.

## Decisions

- `agents.id` is the stable numeric permission id; `agent_configurations.id` remains a version id.
- Existing agent `sId`s stay unchanged and remain the external identifier.
- `agent.editor` grants `read`, `write`, and `admin`, preserving today's behavior.
- Archiving keeps editor memberships active. The archived status, not the ACL, blocks mutations.
- Keep the `isAuthor` fallback through the migration; remove it separately after measuring outliers.
- Code-defined global agents have static ACLs in `AgentResource` and no `group_permissions` rows.

## 0. Preserve editors on archived agents

### PR 0: Freeze archived-agent definition mutations

Add a shared archived-agent mutation guard across configuration, editors, scope, tags, skills, and
batch or auxiliary definition routes. Restore remains allowed; runtime data such as feedback and
memories stays outside this freeze.

### PR 1: Keep archived-agent editors active

Stop suspending/restoring `agent_editors` memberships and backfill memberships already suspended
by archive. Keep runtime effects such as disabling and restoring triggers and wake-ups.

## 1. Add a stable logical agent id

### PR 2: Expand the schema

Create `agents(id, sId, workspaceId)` with `id` as the primary key and `sId` unique. Add an indexed,
nullable `agentId` foreign key to `agent_configurations` in a pre-deploy migration.

### PR 3: Wire the agent identity lifecycle

Create the identity with a pending/new agent and reuse its `agentId` for every later version. Delete
it only when the whole logical agent is hard-deleted and no configuration remains; archive, restore,
and failed-version cleanup leave it unchanged.

### PR 4: Backfill agent identities

Create one identity per existing `sId`, attach every version to it, and report duplicates or missing
rows. Run this idempotent backfill only after PR 3 is deployed.

**Operational gate:** verify every configuration has the expected identity before enforcing the
constraints.

### PR 5: Enforce identity invariants

Make `agent_configurations.agentId` non-null and add uniqueness on `(agentId, version)` in a
post-deploy migration. Keep `sId` on configurations for the future head/version refactor.

## 2. Build and verify the grants path

### PR 6: Preserve editor administration semantics

Add `admin` to the `agent.editor` registry role, with focused registry tests. This defines the final
role semantics independently of the agent resource.

### PR 7: Add the thin Agent Resource

Add a tested `AgentResource` using stable `agentId`, with `getAccessControlLists`, `canRead`,
`canWrite`, and `canAdministrate`. Preserve visible-agent and `isAuthor` rules, and return static ACLs
for code-defined global agents.

### PR 8: Dual-write editor additions

Keep legacy writes and grant initial or newly added editors into the final `regular_auto` group.
Cover pending-agent creation, incremental additions, and additions from full editor-set updates.

### PR 9: Dual-write editor removals and deletion cleanup

Keep legacy writes while revoking removed editors from the final group, including full editor-set
updates. Reuse that grant-deletion path to remove permission rows and the final group when the whole
logical agent is hard-deleted; version cleanup and archive leave grants unchanged.

### PR 10: Backfill agent editor grants

Copy each legacy editor set into the final grant group, including archived agents. Make the script
idempotent and report editor-set differences.

### PR 11: Shadow all grant-backed reads

All three parts continue serving legacy results and use the same `group_permissions_shadow` switch.

#### PR 11a: Shadow editor lists

Add grant-backed single and batch editor-list helpers and the batch resource lookup. Compare editor
sets in editor endpoints and agent configuration context, with resource and shadow regression tests.
Base this PR on `main`.

#### PR 11b: Shadow permissions and usage filters

Compare effective `read`/`write`/`admin` decisions, editable-agent filters for scope and tag updates,
and tool/data-source/webhook usage filters. Stack on PR 11a to reuse its batch resource lookup.

#### PR 11c: Shadow agent views

Compare list/manage/archive results using stable agent identities, preserving archived-editor
filtering and covering it with regression tests. Base this PR independently on `main`.

**Operational gate:** after all three parts merge, enable shadowing progressively and wait for
editor-list, permission, listing, backfill, and cache-related mismatches to reach zero before PR 12.

## 3. Flip and remove the legacy model

### PR 12: Flip all grant-backed reads

Serve editor lists, permission decisions, and list/manage/archive filtering from grants at the same
time, behind one operational switch with a single kill-switch fallback to legacy reads.

**Operational gate:** observe the complete read flip before removing the fallback.

### PR 13: Remove legacy reads and rollout infrastructure

Remove all legacy read fallbacks and shadow comparisons. Remove `group_permissions_shadow`,
`use_legacy_acls`, and shared migration helpers once no other resource migration uses them.

### PR 14: Stop all legacy agent-editor writes

Stop membership mutations, legacy editor-group creation, and new `group_agents` links. Grant-backed
editor mutations become the only write path, and new agents or versions no longer extend the legacy
model.

### PR 15: Delete legacy agent-editor groups

Delete all `agent_editors` groups and their memberships after verifying that no code reads or writes
them. Verify that their associated `group_agents` rows are gone as well.

### PR 16: Remove the `agent_editors` kind

Remove the enum value, guards, factories, tests, and remaining branches for the legacy group kind.
This is safe only after PR 15 has removed all rows of that kind.

### PR 17: Drop `group_agents`

Remove `GroupAgentModel` and its associations, then drop the table in a post-deploy migration.

## 4. Remove the author fallback separately

### PR 18: Remove `isAuthor` as an authorization source

Decide whether author outliers require handling, then remove the fallback so explicit grants are
the sole source of editorship; model ownership explicitly if the product needs it.
