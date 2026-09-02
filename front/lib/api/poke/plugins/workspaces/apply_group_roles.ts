import { createPlugin } from "@app/lib/api/poke/types";
import {
  ADMIN_GROUP_NAME,
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
  }
): ActiveRoleType {
  const { adminUserIds, managerUserIds } = provisioningGroupMembers;

  if (adminUserIds.has(userModelId)) {
    return "admin";
  }
  if (managerUserIds.has(userModelId)) {
    return "manager";
  }
  return "user";
}

export const applyGroupRoles = createPlugin({
  manifest: {
    id: "apply-roles-from-groups",
    name: "Apply group roles",
    description: "Force resync roles from dust-admins and dust-managers",
    resourceTypes: ["workspaces"],
    warning:
      "This action will override the existing membership roles based on the dust-admins and dust-managers groups," +
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

    const [managerGroup] = provisioningGroups.filter(
      (g) => g.name === MANAGER_GROUP_NAME
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
        removeNulls([adminGroup, managerGroup])
      );

    const adminUserIds = new Set(
      membershipsByProvisioningGroup[adminGroup.id] ?? []
    );
    const managerUserIds = new Set(
      managerGroup
        ? (membershipsByProvisioningGroup[managerGroup.id] ?? [])
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
      });

      if (currentRole !== expectedRole) {
        const updateResult = await MembershipResource.updateMembershipRole({
          user,
          workspace,
          newRole: expectedRole,
          author: auth.toPokeUserJSON(),
        });

        if (updateResult.isErr()) {
          errors.push(
            `Failed to update role for user ${user.sId}: ${updateResult.error.type}`
          );
        } else {
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
