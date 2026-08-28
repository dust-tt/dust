# Admin Governance - Agent Migration

This plan migrates workspace-agent editor permissions from the `agent_editors` group kind and
`group_agents` join table to the `regular_auto` group kind and `group_permissions` table.

Each numbered item is one PR. A PR should contain one behavior and aim to stay below 300 changed
lines. Operational gates and production backfill runs are not PRs.

## Decisions

- `agents.id` is the stable numeric permission id; `agent_configurations.id` remains a version id.
- Existing agent `sId`s stay unchanged and remain the external identifier.
- `agent.editor` grants `read`, `write`, and `admin`, preserving today's behavior.
- Archiving keeps editor memberships active. The archived status, not the ACL, blocks mutations.
- Keep the `isAuthor` fallback through the migration; remove it separately after measuring outliers.
- Code-defined global agents have static ACLs in `AgentResource` and no `group_permissions` rows.

## 0. Preserve editors on archived agents

### PR 0: Freeze core mutations on archived agents

Add a shared archived-agent mutation guard and apply it to configuration and editor mutations.
Restore remains allowed.

### PR 1: Freeze remaining definition mutations

Apply the same guard to scope, tags, skills, and other batch or auxiliary routes that mutate an
agent's definition. Keep runtime data such as feedback and memories out of this freeze.

### PR 2: Keep archived-agent editors active

Stop suspending/restoring `agent_editors` memberships and backfill memberships already suspended
by archive. Keep runtime effects such as disabling and restoring triggers and wake-ups.

## 1. Add a stable logical agent id

### PR 3: Expand the schema

Create `agents(id, sId, workspaceId)` with `id` as the primary key and `sId` unique. Add an indexed,
nullable `agentId` foreign key to `agent_configurations` in a pre-deploy migration.

### PR 4: Create and reuse agent identities

Create the identity with a pending/new agent and reuse its `agentId` for every later version.
Creating a version never creates a second identity; archive and restore leave it unchanged.

### PR 5: Clean up identities on logical hard delete

Delete the identity only when the whole logical agent is hard-deleted, including abandoned pending
agents. After failed-version cleanup, delete it only when no configuration remains.

### PR 6: Backfill agent identities

Create one identity per existing `sId`, attach every version to it, and report duplicates or missing
rows. Run this idempotent backfill only after PRs 4 and 5 are deployed.

**Operational gate:** run the backfill and verify that every configuration has exactly one logical
agent before enforcing constraints.

### PR 7: Enforce identity invariants

Make `agent_configurations.agentId` non-null and add uniqueness on `(agentId, version)` in a
post-deploy migration. Keep `sId` on configurations for the future head/version refactor.

## 2. Build and verify the grants path

### PR 8: Preserve editor administration semantics

Add `admin` to the `agent.editor` registry role, with focused registry tests. This defines the final
role semantics without creating or serving agent grants yet.

### PR 9: Add the thin Agent Resource

Add a tested `AgentResource` that uses stable `agentId` for workspace agents and implements
`getAccessControlLists` plus `canRead`, `canWrite`, and `canAdministrate`. Preserve visible-agent and
`isAuthor` rules, and return static ACLs for code-defined global agents.

### PR 10: Dual-write initial editor grants

When creating a pending/new agent, keep creating its legacy editor group and also grant its initial
editors into the final `regular_auto` group.

### PR 11: Dual-write editor additions

Keep legacy writes and grant newly added editors into the final group, including additions made by
a full editor-set update.

### PR 12: Dual-write editor removals

Keep legacy writes and revoke removed editors from the final group, including removals made by a
full editor-set update.

### PR 13: Clean up grants on hard delete

Delete the agent's permission rows and final `regular_auto` group when the logical agent is
hard-deleted. Version cleanup and archive leave grants unchanged.

### PR 14: Backfill agent editor grants

Copy each legacy editor set into the final grant group, including archived agents. Make the script
idempotent and report editor-set differences and authors who are not explicit editors.

### PR 15: Shadow editor-list reads

Add grant-backed `listEditors` and batch-list helpers to `AgentResource`. Continue serving the
legacy editor list while comparing user sets under `group_permissions_shadow`.

### PR 16: Shadow permission decisions

Continue serving legacy `read`, `write`, and `admin` decisions while comparing `AgentResource`.
Compare effective results, including visible-agent and `isAuthor` rules.

### PR 17: Shadow agent-list filtering

List/manage/archive views currently resolve editable agents through `group_agents` version ids.
Keep serving that result while comparing stable ids from
`auth.getResourceIdsWithVerb("agent", ...)`.

**Operational gate:** enable shadowing progressively and wait for editor-list, permission, listing,
backfill, and cache-related mismatches to reach zero.

## 3. Flip and remove the legacy model

### PR 18: Flip editor-list reads

Serve editor lists from `AgentResource`, while keeping legacy writes and a kill-switch fallback.

**Operational gate:** observe the editor-list flip before removing its fallback.

### PR 19: Remove the legacy editor-list fallback

Remove the legacy branch and shadow comparison for editor-list reads only.

### PR 20: Flip permission decisions

Serve `read`, `write`, and `admin` decisions from `AgentResource`, with a kill-switch fallback.

**Operational gate:** observe the permission flip before removing its fallback.

### PR 21: Remove the legacy permission fallback

Remove the legacy branch and shadow comparison for permission decisions only.

### PR 22: Flip agent-list filtering

Use stable agent ids from `group_permissions` for list/manage/archive filtering, with a kill-switch
fallback.

**Operational gate:** observe the listing flip before removing its fallback.

### PR 23: Remove the legacy listing fallback

Remove the legacy branch and shadow comparison for agent-list filtering only.

### PR 24: Remove migration switches

Remove `group_permissions_shadow`, `use_legacy_acls`, and their shared helpers once no other resource
migration uses them.

### PR 25: Stop legacy editor-membership writes

Stop mutating existing `agent_editors` memberships on editor-set, add, and remove operations.
Grant-backed editor mutations become the only update path; initial legacy-group creation remains
until the next PR.

### PR 26: Stop creating legacy editor groups and links

Stop creating `agent_editors` groups for new agents and stop adding `group_agents` links for new
versions, including the initial legacy membership write. This follows PR 25 so no remaining update
path expects those groups to exist.

### PR 27: Delete legacy agent-editor groups

Delete all `agent_editors` groups and their memberships after verifying that no code reads or writes
them. Verify that their associated `group_agents` rows are gone as well.

### PR 28: Remove the `agent_editors` kind

Remove the enum value, guards, factories, tests, and remaining branches for the legacy group kind.
This is safe only after PR 27 has removed all rows of that kind.

### PR 29: Drop `group_agents`

Remove `GroupAgentModel` and its associations, then drop the table in a post-deploy migration.

## 4. Remove the author fallback separately

### PR 30: Remove `isAuthor` as an authorization source

Inspect authors without editor grants and decide how to handle those outliers. Then remove the
fallback so explicit grants are the sole source of editorship; model ownership explicitly if the
product needs it.
