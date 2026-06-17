import { createPlugin } from "@app/lib/api/poke/types";
import {
  ADMIN_GROUP_NAME,
  BUILDER_GROUP_NAME,
  GroupResource,
} from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";

export const applyGroupRoles = createPlugin({
  manifest: {
    id: "apply-roles-from-groups",
    name: "Apply group roles",
    description:
      "Force resync roles using dust-admins and dust-builders groups",
    resourceTypes: ["workspaces"],
    warning:
      "This action will override the existing membership roles based on the dust-admins and dust-builders groups. " +
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
        removeNulls([adminGroup, builderGroup])
      );

    const adminUserIds = new Set(
      membershipsByProvisioningGroup[adminGroup.id] ?? []
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
      const expectedRole = adminUserIds.has(user.id)
        ? "admin"
        : builderUserIds.has(user.id)
          ? "builder"
          : "user";

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
