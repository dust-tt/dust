import { createPlugin } from "@app/lib/api/poke/types";
import { hasFeatureFlag } from "@app/lib/auth";
import {
  ADMIN_GROUP_NAME,
  BUILDER_GROUP_NAME,
  GroupResource,
  MANAGER_GROUP_NAME,
} from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { ActiveRoleType } from "@app/types/user";

function determineExpectedRoleFromGroups(
  userModelId: ModelId,
  provisioningGroupMembers: {
    adminUserIds: Set<ModelId>;
    managerUserIds: Set<ModelId>;
    builderUserIds: Set<ModelId>;
  }
): ActiveRoleType {
  const { adminUserIds, managerUserIds, builderUserIds } =
    provisioningGroupMembers;

  if (adminUserIds.has(userModelId)) {
    return "admin";
  }
  if (managerUserIds.has(userModelId)) {
    return "manager";
  }
  if (builderUserIds.has(userModelId)) {
    return "builder";
  }
  return "user";
}

export const applyGroupRoles = createPlugin({
  manifest: {
    id: "apply-roles-from-groups",
    name: "Apply group roles",
    description:
      "Force resync roles using dust-admins, dust-managers and dust-builders groups",
    resourceTypes: ["workspaces"],
    warning:
      "This action will override the existing membership roles based on the dust-admins, dust-managers and dust-builders groups. " +
      "Make sure the user is aware of this and does not want to keep the roles assigned manually.",
    args: {},
    requiredRoles: ["engineering"],
  },
  execute: async (auth) => {
    const workspace = auth.getNonNullableWorkspace();

    const provisioningGroups =
      await GroupResource.listRoleProvisioningGroupsForWorkspace(auth);

    const [adminGroup] = provisioningGroups.filter(
      (g) => g.name === ADMIN_GROUP_NAME
    );
    if (!adminGroup) {
      return new Ok({
        display: "text",
        value: "dust-admins group not found in workspace.",
      });
    }

    const userCountInAdminGroup = await adminGroup.getMemberCount(auth);
    if (userCountInAdminGroup === 0) {
      return new Ok({
        display: "text",
        value: "dust-admins group found but no users in it.",
      });
    }

    const isManagerProvisioningEnabled = await hasFeatureFlag(
      auth,
      "admin_governance"
    );
    const [managerGroup] = isManagerProvisioningEnabled
      ? provisioningGroups.filter((g) => g.name === MANAGER_GROUP_NAME)
      : [];

    const [builderGroup] = provisioningGroups.filter(
      (g) => g.name === BUILDER_GROUP_NAME
    );

    const { memberships } = await MembershipResource.getActiveMemberships({
      workspace,
    });

    const users = await UserResource.fetchByModelIds([
      ...new Set(memberships.map((m) => m.userId)),
    ]);
    const userByModelId = new Map(users.map((user) => [user.id, user]));

    const membershipsByProvisioningGroup =
      await GroupResource.getActiveMembershipsForGroups(
        auth,
        removeNulls([adminGroup, managerGroup, builderGroup])
      );

    const adminUserIds = new Set(
      membershipsByProvisioningGroup[adminGroup.id] ?? []
    );
    const managerUserIds = new Set(
      managerGroup
        ? (membershipsByProvisioningGroup[managerGroup.id] ?? [])
        : []
    );
    const builderUserIds = new Set(
      builderGroup
        ? (membershipsByProvisioningGroup[builderGroup.id] ?? [])
        : []
    );

    let updatedCount = 0;
    const errors: string[] = [];

    for (const membership of memberships) {
      const user = userByModelId.get(membership.userId);
      if (!user) {
        errors.push(`User not found: ${membership.userId}`);
        continue;
      }

      const currentRole = membership.role;
      const expectedRole = determineExpectedRoleFromGroups(user.id, {
        adminUserIds,
        managerUserIds,
        builderUserIds,
      });

      if (currentRole !== expectedRole) {
        const updateResult = await MembershipResource.updateMembershipRole({
          user,
          workspace,
          newRole: expectedRole,
          author: auth.user()?.toJSON() ?? "no-author",
        });

        if (updateResult.isErr()) {
          errors.push(
            `Failed to update role for user ${user.sId}: ${updateResult.error.type}`
          );
        } else {
          // Per-changed-member queries, like the role update above: poke-only plugin,
          // bounded by the number of role changes.
          await GroupResource.syncBuilderGroupMembership({
            workspace,
            user,
            isBuilder: expectedRole === "builder",
          });
          updatedCount++;
        }
      }
    }

    const groupSummary = provisioningGroups
      .map((g) => `${g.name} (${g.sId})`)
      .join(", ");

    if (errors.length > 0) {
      return new Err(
        new Error(
          `Role sync completed with errors. Updated ${updatedCount} memberships. Groups: ${groupSummary}. Errors: ${errors.join("; ")}`
        )
      );
    }

    return new Ok({
      display: "json",
      value: {
        status: "success",
        message: `Successfully synced membership roles for workspace "${workspace.name}".`,
        updatedCount,
        groupSummary,
      },
    });
  },
});
