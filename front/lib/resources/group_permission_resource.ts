import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { assertValidGrant } from "@app/lib/resources/group_permission_registry";
import { GroupResource } from "@app/lib/resources/group_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupPermissionModel } from "@app/lib/resources/storage/models/group_permissions";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type {
  CapabilitySpec,
  GrantType,
  GroupPermissionResourceType,
} from "@app/types/group_permissions";
import {
  capabilityKey,
  WHOLE_TYPE_RESOURCE_ID,
} from "@app/types/group_permissions";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import assert from "assert";
import type { Attributes, ModelStatic, Transaction } from "sequelize";
import { Op } from "sequelize";

/**
 * All writes to `group_permissions` go through this resource — never a raw model write elsewhere.
 * This file covers instance-level grants and reads; wildcard / type-level writes (resourceId = -1,
 * "*") land through dedicated named methods in a follow-up so a defaulted -1 can never silently
 * grant a whole type.
 */

interface InstanceGrantSpec {
  group: GroupResource;
  grantType: GrantType;
  resourceType: GroupPermissionResourceType;
  resourceId: number;
  transaction?: Transaction;
}

interface TypeWideGrantSpec {
  group: GroupResource;
  grantType: GrantType;
  resourceType: GroupPermissionResourceType;
  transaction?: Transaction;
}

// The state of a governance capability. "everyone" and "admins_only" carry no groups; "groups"
// lists the specific (non-global) groups it is granted to. Scope values match the governance
// page's PermissionConfigurationScope.
export type CapabilityState =
  | { scope: "admins_only" }
  | { scope: "everyone" }
  | { scope: "groups"; groups: GroupResource[] };

interface ListForGroupsSpec {
  groupModelIds: ModelId[];
  grantType?: GrantType;
  resourceType?: GroupPermissionResourceType;
  resourceId?: number;
}

interface UserGrantSpec {
  user: UserType;
  grantType: GrantType;
  resourceType: GroupPermissionResourceType;
  resourceId: number;
  transaction?: Transaction;
}

interface EverybodyGrantSpec {
  grantType: GrantType;
  resourceType: GroupPermissionResourceType;
  resourceId: number;
  transaction?: Transaction;
}

function autoGroupName({
  grantType,
  resourceType,
  resourceId,
}: {
  grantType: GrantType;
  resourceType: GroupPermissionResourceType;
  resourceId: number;
}): string {
  return `Group for permission ${grantType} on ${resourceType} (${resourceId})`;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface GroupPermissionResource
  extends ReadonlyAttributesType<GroupPermissionModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class GroupPermissionResource extends BaseResource<GroupPermissionModel> {
  static model: ModelStatic<GroupPermissionModel> = GroupPermissionModel;

  constructor(
    model: ModelStatic<GroupPermissionModel>,
    blob: Attributes<GroupPermissionModel>
  ) {
    super(GroupPermissionModel, blob);
  }

  // A group is scoped to a single workspace, and every grant is scoped to the caller's workspace.
  // The DB only FKs groupId to groups.id (not to the workspace), so we enforce the match here to
  // keep a group from workspace B out of workspace A's grants.
  private static assertGroupInWorkspace(
    auth: Authenticator,
    group: GroupResource
  ): void {
    assert(
      group.workspaceId === auth.getNonNullableWorkspace().id,
      "Group does not belong to the authenticated workspace."
    );
  }

  // Grant an instance-level permission (a specific resource). Idempotent: the unique index dedupes,
  // so granting twice is a no-op. Type-wide grants (resourceId = -1) go through dedicated methods.
  // A regular_auto group is the single backing group of its tuple: granting one when a different
  // regular_auto group already holds the tuple is rejected (under the grant-tuple lock, so
  // concurrent inserts cannot slip through).
  // TODO(admin-governance): Decide whether system group should be rejected here (and in
  // revoke) or left to callers; align with setGroups / setForEverybody conventions.
  static async grant(
    auth: Authenticator,
    {
      group,
      grantType,
      resourceType,
      resourceId,
      transaction,
    }: InstanceGrantSpec
  ): Promise<GroupPermissionResource> {
    assert(
      resourceId > 0,
      "grant() is instance-level; use a dedicated wildcard method for type-wide grants."
    );
    this.assertGroupInWorkspace(auth, group);
    assertValidGrant({ grantType, resourceType, resourceId });

    const workspaceId = auth.getNonNullableWorkspace().id;
    return withTransaction(async (t) => {
      if (group.kind === "regular_auto") {
        await this.getGrantLock(
          auth,
          { grantType, resourceType, resourceId },
          t
        );
        const existing = await this.findRegularAutoGroupForGrant(auth, {
          grantType,
          resourceType,
          resourceId,
          transaction: t,
        });
        assert(
          !existing || existing.id === group.id,
          "Another regular_auto group already holds this grant tuple."
        );
      }

      const [row] = await GroupPermissionModel.findOrCreate({
        where: {
          workspaceId,
          groupId: group.id,
          grantType,
          resourceType,
          resourceId,
        },
        transaction: t,
      });

      return new this(GroupPermissionModel, row.get());
    }, transaction);
  }

  // Find the regular_auto group backing user-level grants for the given tuple. At most one exists
  // per (grantType, resourceType, resourceId): grantToUser and revokeFromUser serialize on the
  // grant-tuple advisory lock (getGrantLock), and grant() rejects a second regular_auto group.
  private static async findRegularAutoGroupForGrant(
    auth: Authenticator,
    {
      grantType,
      resourceType,
      resourceId,
      transaction,
    }: {
      grantType: GrantType;
      resourceType: GroupPermissionResourceType;
      resourceId: number;
      transaction?: Transaction;
    }
  ): Promise<GroupResource | null> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    const grants = await GroupPermissionModel.findAll({
      where: {
        workspaceId,
        grantType,
        resourceType,
        resourceId,
      },
      transaction,
    });
    if (grants.length === 0) {
      return null;
    }

    const groupIds = [...new Set(grants.map((grant) => grant.groupId))];
    const groups = await GroupResource.fetchByModelIds(auth, groupIds, {
      transaction,
    });

    return groups.find((group) => group.kind === "regular_auto") ?? null;
  }

  // Grant a user access to a resource by adding them to the regular_auto group that holds the
  // grant. Creates the group and calls grant() on first use — the grant-tuple lock serializes
  // concurrent first grants so only one regular_auto group is ever created. Idempotent for repeat
  // grants to the same user.
  static async grantToUser(
    auth: Authenticator,
    { user, grantType, resourceType, resourceId, transaction }: UserGrantSpec
  ): Promise<Result<undefined, Error>> {
    return withTransaction(async (t) => {
      await this.getGrantLock(auth, { grantType, resourceType, resourceId }, t);

      let group = await this.findRegularAutoGroupForGrant(auth, {
        grantType,
        resourceType,
        resourceId,
        transaction: t,
      });

      if (!group) {
        group = await GroupResource.makeNew(
          {
            name: autoGroupName({ grantType, resourceType, resourceId }),
            kind: "regular_auto",
            workspaceId: auth.getNonNullableWorkspace().id,
          },
          { transaction: t }
        );
        await this.grant(auth, {
          group,
          grantType,
          resourceType,
          resourceId,
          transaction: t,
        });
      }

      const addResult = await group.dangerouslyAddMember(auth, {
        user,
        transaction: t,
      });
      // Repeat grant for the same user: the desired end state already holds, stay idempotent.
      if (addResult.isErr() && addResult.error.code !== "user_already_member") {
        return addResult;
      }

      return new Ok(undefined);
    }, transaction);
  }

  // Revoke a user's access by removing them from the regular_auto group that holds the grant. If the
  // user was the last member, revokes the grant and deletes the group. No-op when the user is not a
  // member of the backing group.
  static async revokeFromUser(
    auth: Authenticator,
    { user, grantType, resourceType, resourceId, transaction }: UserGrantSpec
  ): Promise<Result<undefined, Error>> {
    return withTransaction(async (t) => {
      await this.getGrantLock(auth, { grantType, resourceType, resourceId }, t);

      const group = await this.findRegularAutoGroupForGrant(auth, {
        grantType,
        resourceType,
        resourceId,
        transaction: t,
      });
      if (!group) {
        return new Ok(undefined);
      }

      const membership = await GroupMembershipModel.findOne({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          groupId: group.id,
          userId: user.id,
          status: "active",
          startAt: { [Op.lte]: new Date() },
          [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
        },
        transaction: t,
      });
      if (!membership) {
        return new Ok(undefined);
      }

      const memberCount = await group.getMemberCount(auth);
      const removeResult = await group.dangerouslyRemoveMember(auth, {
        user,
        transaction: t,
      });
      if (removeResult.isErr()) {
        return removeResult;
      }

      if (memberCount === 1) {
        await this.revoke(auth, {
          group,
          grantType,
          resourceType,
          resourceId,
          transaction: t,
        });
        const deleteResult = await group.delete(auth, { transaction: t });
        if (deleteResult.isErr()) {
          return deleteResult;
        }
      }

      return new Ok(undefined);
    }, transaction);
  }

  // Grant an instance-level permission to the whole workspace via the global group. Idempotent.
  // Distinct from setForEverybody, which grants a type-wide (-1) governance capability.
  static async grantToEverybody(
    auth: Authenticator,
    { grantType, resourceType, resourceId, transaction }: EverybodyGrantSpec
  ): Promise<void> {
    const globalGroup = await GroupResource.internalFetchWorkspaceGlobalGroup(
      auth.getNonNullableWorkspace().id
    );
    assert(globalGroup, "Workspace is missing its global group.");

    await this.grant(auth, {
      group: globalGroup,
      grantType,
      resourceType,
      resourceId,
      transaction,
    });
  }

  // Revoke an instance-level permission from the whole workspace (the global group). No-op if absent.
  static async revokeFromEverybody(
    auth: Authenticator,
    { grantType, resourceType, resourceId, transaction }: EverybodyGrantSpec
  ): Promise<void> {
    const globalGroup = await GroupResource.internalFetchWorkspaceGlobalGroup(
      auth.getNonNullableWorkspace().id
    );
    assert(globalGroup, "Workspace is missing its global group.");

    await this.revoke(auth, {
      group: globalGroup,
      grantType,
      resourceType,
      resourceId,
      transaction,
    });
  }

  // Revoke a single instance-level grant. No-op if absent. Type-wide (-1) grants are removed via
  // revokeTypeWide, mirroring the instance-only contract of grant().
  // TODO(admin-governance): See grant() — same open question on system/global group restrictions.
  static async revoke(
    auth: Authenticator,
    {
      group,
      grantType,
      resourceType,
      resourceId,
      transaction,
    }: InstanceGrantSpec
  ): Promise<void> {
    assert(
      resourceId > 0,
      "revoke() is instance-level; use revokeTypeWide for type-wide grants."
    );
    await GroupPermissionModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        groupId: group.id,
        grantType,
        resourceType,
        resourceId,
      },
      transaction,
    });
  }

  // Read grants for the given groups, optionally narrowed by grant type / resource type /
  // resource. The (workspaceId, resourceType, resourceId) index backs type/resource-scoped reads.
  // Grants for the given groups in a workspace. Takes a LightWorkspaceType (not an Authenticator) so
  // it can resolve a caller's grant set before an Authenticator exists (see
  // `Authenticator.resolvePermissions`). Omit the filters to load every grant.
  static async listForGroups(
    workspace: LightWorkspaceType,
    { groupModelIds, grantType, resourceType, resourceId }: ListForGroupsSpec
  ): Promise<GroupPermissionResource[]> {
    if (groupModelIds.length === 0) {
      return [];
    }

    const rows = await GroupPermissionModel.findAll({
      where: {
        workspaceId: workspace.id,
        groupId: groupModelIds,
        ...(grantType !== undefined ? { grantType } : {}),
        ...(resourceType !== undefined ? { resourceType } : {}),
        ...(resourceId !== undefined ? { resourceId } : {}),
      },
    });

    return rows.map((row) => new this(GroupPermissionModel, row.get()));
  }

  // System keys can represent nearly every group in a workspace. Expanding those group ids into
  // an IN clause on every authenticated request is much more expensive than reading the usually
  // small workspace grant set through its workspace-leading index and filtering it in memory.
  // Keep the exact caller group semantics by intersecting with the ids already resolved for the
  // Authenticator.
  static async listForGroupsFromWorkspaceScan(
    workspace: LightWorkspaceType,
    groupModelIds: ModelId[]
  ): Promise<GroupPermissionResource[]> {
    if (groupModelIds.length === 0) {
      return [];
    }

    const groupModelIdSet = new Set(groupModelIds);
    const rows = await GroupPermissionModel.findAll({
      where: { workspaceId: workspace.id },
    });

    return rows
      .filter((row) => groupModelIdSet.has(row.groupId))
      .map((row) => new this(GroupPermissionModel, row.get()));
  }

  // Deletion-integrity hook: drop every grant (across all groups) targeting one resource. There is
  // no FK on the resource side, so callers invoke this when a resource is deleted. Guards against
  // wiping the type-wide wildcard rows.
  static async deleteAllForResource(
    auth: Authenticator,
    {
      resourceType,
      resourceId,
      transaction,
    }: {
      resourceType: GroupPermissionResourceType;
      resourceId: number;
      transaction?: Transaction;
    }
  ): Promise<number> {
    assert(
      resourceId > 0 && resourceId !== WHOLE_TYPE_RESOURCE_ID,
      "deleteAllForResource targets a concrete resource; it must not clear type-wide grants."
    );

    return GroupPermissionModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        resourceType,
        resourceId,
      },
      transaction,
    });
  }

  // Workspace-scrub hook: drop every grant for the workspace. Must run before groups and the
  // workspace row are torn down, since both FKs are ON DELETE RESTRICT.
  static async deleteAllForWorkspace(auth: Authenticator): Promise<void> {
    await GroupPermissionModel.destroy({
      where: { workspaceId: auth.getNonNullableWorkspace().id },
    });
  }

  // Grant a permission for the whole resource type (resourceId = -1). Single-group convenience over
  // grantTypeWideForGroups. Dedicated, explicitly named so a defaulted -1 can never silently reach
  // `grant`. Idempotent. Used for type-level grant types (e.g. "create") and governance
  // capabilities.
  static async grantTypeWide(
    auth: Authenticator,
    { group, grantType, resourceType, transaction }: TypeWideGrantSpec
  ): Promise<void> {
    await this.grantTypeWideForGroups(auth, {
      groups: [group],
      grantType,
      resourceType,
      transaction,
    });
  }

  // Batch of grantTypeWide across groups (one INSERT, unique index dedupes). Backs the
  // governance setGroups transition without an N+1.
  static async grantTypeWideForGroups(
    auth: Authenticator,
    {
      groups,
      grantType,
      resourceType,
      transaction,
    }: {
      groups: GroupResource[];
      grantType: GrantType;
      resourceType: GroupPermissionResourceType;
      transaction?: Transaction;
    }
  ): Promise<void> {
    assertValidGrant({
      grantType,
      resourceType,
      resourceId: WHOLE_TYPE_RESOURCE_ID,
    });
    groups.forEach((group) => this.assertGroupInWorkspace(auth, group));
    if (groups.length === 0) {
      return;
    }

    const workspaceId = auth.getNonNullableWorkspace().id;
    await GroupPermissionModel.bulkCreate(
      groups.map((group) => ({
        workspaceId,
        groupId: group.id,
        grantType,
        resourceType,
        resourceId: WHOLE_TYPE_RESOURCE_ID,
      })),
      { ignoreDuplicates: true, transaction }
    );
  }

  // Revoke a group's type-wide grant. No-op if absent.
  static async revokeTypeWide(
    auth: Authenticator,
    { group, grantType, resourceType, transaction }: TypeWideGrantSpec
  ): Promise<void> {
    await GroupPermissionModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        groupId: group.id,
        grantType,
        resourceType,
        resourceId: WHOLE_TYPE_RESOURCE_ID,
      },
      transaction,
    });
  }

  // Batch of instance-level grants (one INSERT, unique index dedupes). Each is validated; -1 is
  // rejected here as in `grant` — type-wide grants use the dedicated methods above. regular_auto
  // groups are rejected: their one-group-per-tuple check is per-row (see grant), which would
  // defeat the batch — grant them through grant()/grantToUser instead.
  static async grantMany(
    auth: Authenticator,
    {
      grants,
      transaction,
    }: {
      grants: Array<{
        group: GroupResource;
        grantType: GrantType;
        resourceType: GroupPermissionResourceType;
        resourceId: number;
      }>;
      transaction?: Transaction;
    }
  ): Promise<void> {
    if (grants.length === 0) {
      return;
    }
    for (const { group, grantType, resourceType, resourceId } of grants) {
      assert(
        resourceId > 0,
        "grantMany is instance-level; use the dedicated type-wide methods for -1 grants."
      );
      assert(
        group.kind !== "regular_auto",
        "grantMany cannot target regular_auto groups; use grant()/grantToUser."
      );
      this.assertGroupInWorkspace(auth, group);
      assertValidGrant({ grantType, resourceType, resourceId });
    }

    const workspaceId = auth.getNonNullableWorkspace().id;
    await GroupPermissionModel.bulkCreate(
      grants.map(({ group, grantType, resourceType, resourceId }) => ({
        workspaceId,
        groupId: group.id,
        grantType,
        resourceType,
        resourceId,
      })),
      { ignoreDuplicates: true, transaction }
    );
  }

  // ---------------------------------------------------------------------------
  // Governance-toggle state (read side).
  //
  // A capability is a (grantType, resourceType) pair whose grants live on the type-wide (-1)
  // rows. Each is in one of three mutually-exclusive states, by convention:
  //   - no -1 row                              => disabled
  //   - a -1 row for the workspace global group => everyone
  //   - -1 rows for specific groups            => those groups only (additive)
  // The write side (which keeps the states exclusive) lands in a follow-up.
  // ---------------------------------------------------------------------------

  // Resolve the state of each requested capability in a single query (plus one batched group
  // fetch), keyed by `${grantType}:${resourceType}`. Backs the governance page, which needs
  // every capability at once; per-capability helpers (disabled / everyone / groups) can derive
  // from the returned state.
  static async getCapabilitiesState(
    auth: Authenticator,
    capabilities: CapabilitySpec[]
  ): Promise<Map<string, CapabilityState>> {
    const result = new Map<string, CapabilityState>();
    if (capabilities.length === 0) {
      return result;
    }

    // Reject invalid capability pairs (e.g. write/billing) — programmer errors, fail fast.
    for (const capability of capabilities) {
      assertValidGrant({ ...capability, resourceId: WHOLE_TYPE_RESOURCE_ID });
    }

    const workspaceId = auth.getNonNullableWorkspace().id;
    const globalGroup =
      await GroupResource.internalFetchWorkspaceGlobalGroup(workspaceId);
    assert(globalGroup, "Workspace is missing its global group.");

    // One query: every type-wide (-1) row for the requested capabilities.
    const rows = await GroupPermissionModel.findAll({
      where: {
        workspaceId,
        resourceId: WHOLE_TYPE_RESOURCE_ID,
        [Op.or]: capabilities.map(({ grantType, resourceType }) => ({
          grantType,
          resourceType,
        })),
      },
    });

    // One batched fetch for every non-global group referenced across all capabilities.
    const groupModelIds = [
      ...new Set(
        rows
          .map((row) => row.groupId)
          .filter((groupModelId) => groupModelId !== globalGroup.id)
      ),
    ];
    const groups = groupModelIds.length
      ? await GroupResource.fetchByModelIds(auth, groupModelIds)
      : [];
    const groupByModelId = new Map(groups.map((group) => [group.id, group]));

    for (const capability of capabilities) {
      const capabilityRows = rows.filter(
        (row) =>
          row.grantType === capability.grantType &&
          row.resourceType === capability.resourceType
      );
      const key = capabilityKey(capability);

      if (capabilityRows.length === 0) {
        result.set(key, { scope: "admins_only" });
      } else if (capabilityRows.some((row) => row.groupId === globalGroup.id)) {
        result.set(key, { scope: "everyone" });
      } else {
        result.set(key, {
          scope: "groups",
          groups: removeNulls(
            capabilityRows.map((row) => groupByModelId.get(row.groupId))
          ),
        });
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Governance-toggle state (write side).
  //
  // The three states are mutually exclusive, so each transition first clears every -1 row for the
  // capability, then writes the new state — atomically, in a transaction.
  // ---------------------------------------------------------------------------

  // Remove every -1 row for the capability => disabled.
  static async disable(
    auth: Authenticator,
    { grantType, resourceType }: CapabilitySpec,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    await GroupPermissionModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        grantType,
        resourceType,
        resourceId: WHOLE_TYPE_RESOURCE_ID,
      },
      transaction,
    });
  }

  // Serialize concurrent writes on the same grant tuple. The transaction-scoped advisory lock
  // releases on commit/rollback. Two uses:
  //   - capability transitions (resourceId = -1): without it, two transactions can each clear the
  //     -1 rows and then insert, leaving both the everybody row and specific-group rows
  //     (overgranting);
  //   - user-level grants: serializes grantToUser's find-or-create against itself and against
  //     revokeFromUser's delete-when-empty, guaranteeing at most one regular_auto group per tuple.
  private static async getGrantLock(
    auth: Authenticator,
    {
      grantType,
      resourceType,
      resourceId,
    }: {
      grantType: GrantType;
      resourceType: GroupPermissionResourceType;
      resourceId: number;
    },
    transaction: Transaction
  ): Promise<void> {
    // Type-wide (-1) transitions keep the pre-resourceId key format so pods running older code
    // mutually exclude with newer ones across a rolling deploy or rollback.
    const workspaceId = auth.getNonNullableWorkspace().id;
    const key =
      resourceId === WHOLE_TYPE_RESOURCE_ID
        ? `group_permissions:${workspaceId}:${resourceType}:${grantType}`
        : `group_permissions:${workspaceId}:${resourceType}:${resourceId}:${grantType}`;
    // biome-ignore lint/plugin/noRawSql: advisory lock requires raw SQL
    await frontSequelize.query("SELECT pg_advisory_xact_lock(hashtext(:key))", {
      replacements: { key },
      transaction,
    });
  }

  // Grant the capability to the whole workspace (the global group), clearing any specific-group rows.
  static async setForEverybody(
    auth: Authenticator,
    capability: CapabilitySpec,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    const globalGroup = await GroupResource.internalFetchWorkspaceGlobalGroup(
      auth.getNonNullableWorkspace().id
    );
    assert(globalGroup, "Workspace is missing its global group.");

    await withTransaction(async (t) => {
      await this.getGrantLock(
        auth,
        { ...capability, resourceId: WHOLE_TYPE_RESOURCE_ID },
        t
      );
      await this.disable(auth, capability, { transaction: t });
      await this.grantTypeWide(auth, {
        group: globalGroup,
        ...capability,
        transaction: t,
      });
    }, transaction);
  }

  // Grant the capability to exactly `groups`, clearing the everybody row and any other specific
  // rows. System and global groups are rejected: system is internal, and "everybody" goes through
  // setForEverybody so the states stay unambiguous.
  static async setGroups(
    auth: Authenticator,
    capability: CapabilitySpec,
    groups: GroupResource[],
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    for (const group of groups) {
      assert(
        !group.isSystem(),
        "Cannot grant a governance capability to the system group."
      );
      assert(
        !group.isGlobal(),
        "Use setForEverybody to grant a capability to the whole workspace."
      );
    }

    await withTransaction(async (t) => {
      await this.getGrantLock(
        auth,
        { ...capability, resourceId: WHOLE_TYPE_RESOURCE_ID },
        t
      );
      await this.disable(auth, capability, { transaction: t });
      await this.grantTypeWideForGroups(auth, {
        groups,
        ...capability,
        transaction: t,
      });
    }, transaction);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });

    return new Ok(undefined);
  }
}
