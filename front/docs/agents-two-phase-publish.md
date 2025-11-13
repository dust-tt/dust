# Two-phase publish for Agent upgrades (proposal)

Context: Fixes https://github.com/dust-tt/tasks/issues/5083

Problem
- `createAgentConfiguration` currently archives the previous "active" version first, then creates
  the new version and its actions. If action creation fails, we hard-delete the new version but the
  previous one remains archived, making the agent unavailable until a manual restore.

Goal
- Ensure upgrades are all-or-nothing: either the new version is fully created (config + actions),
  then atomically replaces the active one, or the system leaves the previous version untouched and
  visible.

Proposed approach (two-phase publish)
1) Create the new version as unpublished and isolated
   - Use the same `sId` and next `version`.
   - Set `scope: "hidden"` (unpublished) and `status: "active"`.
   - Keep editor group and tags creation limited to what is needed; reuse existing reserved tags
     checks. Favor copying editors/tags after successful action creation (below) to minimize work to
     undo.

2) Create all actions for the new version
   - Extend `createAgentActionConfiguration` to accept an optional `transaction` and reuse it when
     provided (no nested `withTransaction`).
   - Create action records (and data sources/tables/reasoning sub-records) inside the same
     transaction as the agent config creation.

3) Publish atomically (transaction commit boundary)
   - Still inside the transaction:
     - Archive all previous versions for `sId` (as today).
     - Flip the new version to `scope: previous_scope` (usually `"published"`) and ensure `status:
       "active"`.
     - Copy editors and tags onto the new version (if not already done in step 1).

4) Failure semantics
   - Any error while creating actions or sub-records aborts the transaction and leaves the previous
     active version intact and visible.
   - No compensating "restore" step required.

Notes on implementation
- Transactions
  - `createAgentConfiguration` already supports an optional `transaction` via `withTransaction`.
  - Update `createAgentActionConfiguration` to accept `transaction?: Transaction` and only call
    `withTransaction` when `!transaction`.
  - Call both functions from a single `withTransaction` block in
    `createOrUpgradeAgentConfiguration`.

- Scope/Status
  - We already use `scope: "hidden"` for unpublished internal agents; reuse this as a staging scope
    while building the new version.

- Editors/Tags
  - Preserve existing reserved-tag invariants. Defer tag/editor replication to right before
    publication (same transaction) to keep rollback trivial.

- Triggers
  - Publishing should keep current behavior (archiving disables triggers for the old version; the
    new active version will have its triggers created/enabled as applicable by existing flows).

Migration / backward compatibility
- No schema changes. Purely behavioral change in the creation flow.
- Existing APIs and types remain unchanged.

Risks
- Medium: touches agent creation and action creation paths; covered by endpoint functional tests.

Test plan (high-level)
- Simulate action creation failure: previous version remains active and visible; no new records
  leaked.
- Successful upgrade: previous version archived, new one published; actions present and callable.
- Permission checks unchanged; reserved tags preserved.

