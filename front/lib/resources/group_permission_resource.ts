import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { assertValidGrant } from "@app/lib/resources/group_permission_registry";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupPermissionModel } from "@app/lib/resources/storage/models/group_permissions";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type {
  GroupPermissionResourceType,
  PermissionType,
} from "@app/types/group_permissions";
import { WHOLE_TYPE_RESOURCE_ID } from "@app/types/group_permissions";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
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
  permissionType: PermissionType;
  resourceType: GroupPermissionResourceType;
  resourceId: number;
  transaction?: Transaction;
}

interface TypeWideGrantSpec {
  group: GroupResource;
  permissionType: PermissionType;
  resourceType: GroupPermissionResourceType;
  transaction?: Transaction;
}

interface CapabilitySpec {
  permissionType: PermissionType;
  resourceType: GroupPermissionResourceType;
}

// The state of a governance capability. "everyone" and "disabled" carry no groups; "groups" lists
// the specific (non-global) groups it is granted to. Scope values match the governance page's
// PermissionConfigurationScope.
export type CapabilityState =
  | { scope: "disabled" }
  | { scope: "everyone" }
  | { scope: "groups"; groups: GroupResource[] };

function capabilityKey({
  permissionType,
  resourceType,
}: CapabilitySpec): string {
  return `${permissionType}:${resourceType}`;
}

interface ListForGroupsSpec {
  groupModelIds: ModelId[];
  permissionType?: PermissionType;
  resourceType?: GroupPermissionResourceType;
  resourceId?: number;
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
  static async grant(
    auth: Authenticator,
    {
      group,
      permissionType,
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
    assertValidGrant({ permissionType, resourceType, resourceId });

    const workspaceId = auth.getNonNullableWorkspace().id;
    const [row] = await GroupPermissionModel.findOrCreate({
      where: {
        workspaceId,
        groupId: group.id,
        permissionType,
        resourceType,
        resourceId,
      },
      transaction,
    });

    return new this(GroupPermissionModel, row.get());
  }

  // Revoke a single instance-level grant. No-op if absent. Type-wide (-1) grants are removed via
  // revokeTypeWide, mirroring the instance-only contract of grant().
  static async revoke(
    auth: Authenticator,
    {
      group,
      permissionType,
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
        permissionType,
        resourceType,
        resourceId,
      },
      transaction,
    });
  }

  // Read grants for the given groups, optionally narrowed by verb / type / resource. The
  // (workspaceId, resourceType, resourceId) index backs type/resource-scoped reads.
  static async listForGroups(
    auth: Authenticator,
    {
      groupModelIds,
      permissionType,
      resourceType,
      resourceId,
    }: ListForGroupsSpec
  ): Promise<GroupPermissionResource[]> {
    if (groupModelIds.length === 0) {
      return [];
    }

    const rows = await GroupPermissionModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        groupId: groupModelIds,
        ...(permissionType !== undefined ? { permissionType } : {}),
        ...(resourceType !== undefined ? { resourceType } : {}),
        ...(resourceId !== undefined ? { resourceId } : {}),
      },
    });

    return rows.map((row) => new this(GroupPermissionModel, row.get()));
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
  // `grant`. Idempotent. Used for type-level verbs (e.g. "create") and governance capabilities.
  static async grantTypeWide(
    auth: Authenticator,
    { group, permissionType, resourceType, transaction }: TypeWideGrantSpec
  ): Promise<void> {
    await this.grantTypeWideForGroups(auth, {
      groups: [group],
      permissionType,
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
      permissionType,
      resourceType,
      transaction,
    }: {
      groups: GroupResource[];
      permissionType: PermissionType;
      resourceType: GroupPermissionResourceType;
      transaction?: Transaction;
    }
  ): Promise<void> {
    assertValidGrant({
      permissionType,
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
        permissionType,
        resourceType,
        resourceId: WHOLE_TYPE_RESOURCE_ID,
      })),
      { ignoreDuplicates: true, transaction }
    );
  }

  // Revoke a group's type-wide grant. No-op if absent.
  static async revokeTypeWide(
    auth: Authenticator,
    { group, permissionType, resourceType, transaction }: TypeWideGrantSpec
  ): Promise<void> {
    await GroupPermissionModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        groupId: group.id,
        permissionType,
        resourceType,
        resourceId: WHOLE_TYPE_RESOURCE_ID,
      },
      transaction,
    });
  }

  // Batch of instance-level grants (one INSERT, unique index dedupes). Each is validated; -1 is
  // rejected here as in `grant` — type-wide grants use the dedicated methods above.
  static async grantMany(
    auth: Authenticator,
    {
      grants,
      transaction,
    }: {
      grants: Array<{
        group: GroupResource;
        permissionType: PermissionType;
        resourceType: GroupPermissionResourceType;
        resourceId: number;
      }>;
      transaction?: Transaction;
    }
  ): Promise<void> {
    if (grants.length === 0) {
      return;
    }
    for (const { group, permissionType, resourceType, resourceId } of grants) {
      assert(
        resourceId > 0,
        "grantMany is instance-level; use the dedicated type-wide methods for -1 grants."
      );
      this.assertGroupInWorkspace(auth, group);
      assertValidGrant({ permissionType, resourceType, resourceId });
    }

    const workspaceId = auth.getNonNullableWorkspace().id;
    await GroupPermissionModel.bulkCreate(
      grants.map(({ group, permissionType, resourceType, resourceId }) => ({
        workspaceId,
        groupId: group.id,
        permissionType,
        resourceType,
        resourceId,
      })),
      { ignoreDuplicates: true, transaction }
    );
  }

  // ---------------------------------------------------------------------------
  // Governance-toggle state (read side).
  //
  // A capability is a (permissionType, resourceType) pair whose grants live on the type-wide (-1)
  // rows. Each is in one of three mutually-exclusive states, by convention:
  //   - no -1 row                              => disabled
  //   - a -1 row for the workspace global group => everyone
  //   - -1 rows for specific groups            => those groups only (additive)
  // The write side (which keeps the states exclusive) lands in a follow-up.
  // ---------------------------------------------------------------------------

  // Resolve the state of each requested capability in a single query (plus one batched group
  // fetch), keyed by `${permissionType}:${resourceType}`. Backs the governance page, which needs
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
        [Op.or]: capabilities.map(({ permissionType, resourceType }) => ({
          permissionType,
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
          row.permissionType === capability.permissionType &&
          row.resourceType === capability.resourceType
      );
      const key = capabilityKey(capability);

      if (capabilityRows.length === 0) {
        result.set(key, { scope: "disabled" });
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
