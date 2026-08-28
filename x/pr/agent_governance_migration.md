# Admin Governance - Agent Migration

This plan migrates workspace-agent editor permissions from `agent_editors` group kind and
`group_agents` join table to `regular_auto` group kind and `group_permissions` table. 

Each numbered item is one PR. Observation and backfill execution gates are called out separately.

## Decisions
- `agents.id` is the stable numeric permission id; `agent_configurations.id` remains a version id.
- Existing agent `sId`s stay unchanged and remain the external identifier.
- `agent.editor` grants `read`, `write`, and `admin`, preserving today's behavior.
- Archiving keeps editor memberships active. The archived status, not the ACL, blocks mutations.
- Keep the `isAuthor` fallback through the migration; remove it separately after measuring outliers.
- code-defined global agents: the rules governing their permissions are static, and don't need the grants table. The logic can be implemented directly in the resource's `getAccessControlLists` method;

## 0. Preserve editors on archived agents

### PR 0: Stop suspending editors on archive

Stop suspending/restoring `agent_editors` memberships, reject mutations on archived agents except
restore, and keep runtime cleanup such as disabling triggers and wake-ups. Include an idempotent
backfill for memberships already suspended by archive, so archived-agent editors remain visible.

## 1. Add a stable logical agent id

### PR 1: Expand the schema

Create `agents(id, sId, workspaceId)` with `id` as the primary key and `sId` unique. Add an indexed,
nullable `agentId` foreign key to `agent_configurations`; nullable keeps the deploy compatible with
old code and existing rows.

### PR 2: Wire the agent identity lifecycle

Create the identity with a pending/new agent and reuse its `agentId` for every later version.
Archive and restore leave it unchanged; hard deletion removes it only when deleting the whole
logical agent, not when cleaning up one failed version.

### PR 3: Backfill agent identities

Create one identity per existing `sId`, attach every version to it, and report duplicates or missing
rows. The backfill must be idempotent and run after PR 2 is deployed so new writes cannot create
more unlinked configurations.

### PR 4: Enforce identity invariants

After verifying the backfill, make `agent_configurations.agentId` non-null and add uniqueness on
`(agentId, version)`. Keep the existing `sId` columns and indexes for now; moving them belongs to a
future head/version refactor.

## 2. Build and verify the grants path

### PR 5: Add the thin Agent Resource and final ACL semantics

Add `AgentResource`, that uses the stable `agentId`, implements `getAccessControlLists`, editor listing helpers, and the current derived rules for
visible agents and `isAuthor`;

also add `admin` to the `agent.editor` registry role. [=> separate PR]

### PR 6: Dual-write every editor mutation

Keep legacy writes, but also grant/revoke membership in the `regular_auto` group holding
`(editor, agent, agentId)`. Cover initial creator grants, full editor-set updates, editor add/remove,
and hard-delete cleanup; version creation and archive must not alter grants.

### PR 7: Backfill agent editor grants

For every logical agent, copy the legacy editor set into its final `regular_auto` grant group.
Include archived agents, make the script idempotent, and report editor-set differences and authors
who are not explicit editors without silently changing their membership.

### PR 8: Shadow permission and editor-list reads

Continue serving legacy results while comparing the grants path for `read`, `write`, `admin`, and
the resolved editor list. Use the existing `group_permissions_shadow` flag and structured mismatch
logs; compare effective decisions, including visible-agent and `isAuthor` rules.

### PR 9: Shadow agent-list filtering

Agent list/manage/archive views currently find editable agents through `group_agents` version ids.
Keep serving that result while comparing it with stable agent ids from
`auth.getResourceIdsWithVerb("agent", ...)`, including hidden and archived views.

**Operational gate:** enable shadowing progressively and wait for the backfill and cache-related
mismatches to reach zero before flipping.

## 3. Flip and remove the legacy model

### PR 10: Flip reads to grants

Serve permission decisions, editor lists, and agent-list filtering from `AgentResource` /
`group_permissions`. Keep legacy writes temporarily and retain a kill-switch fallback so the flip
can be reverted without data loss.

**Operational gate:** observe production before removing the fallback or legacy writes.

### PR 11: Stop all legacy reads and writes

Remove `GroupResource` agent-editor resolution, `group_agents` links on new versions, and legacy
editor-group mutations. `AgentResource` and `group_permissions` become the only editor path.

### PR 12: Delete legacy agent-editor groups

Delete all `agent_editors` groups and their memberships after verifying that no code reads them.
Verify that the associated `group_agents` rows are gone as well.

### PR 13: Remove the `agent_editors` kind

Remove the enum value, guards, factories, tests, and remaining code branches for the legacy group
kind. This is safe only after PR 12 has removed all rows of that kind.

### PR 14: Drop `group_agents`

Remove `GroupAgentModel` and its associations, then drop the table in a post-deploy migration.

## 4. Remove the author fallback separately

### PR 15: Remove `isAuthor` as an authorization source

After the migration has been stable, inspect the shadow data for authors without editor grants and
decide how to handle those outliers. Then remove the fallback so explicit grants are the sole source
of editorship; if the product needs ownership, model it explicitly instead.
