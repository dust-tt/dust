import { createPlugin } from "@app/lib/api/poke/types";
import { determineUserRoleFromGroups } from "@app/lib/api/user";
import {
  ADMIN_GROUP_NAME,
  GroupResource,
} from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { Err, Ok } from "@app/types";

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

    if (provisioningGroups.length === 0) {
      return new Ok({
        display: "text",
        value:
          "dust-admins or dust-builders group both not found in workspace.",
      });
    }

    const { memberships } = await MembershipResource.getActiveMemberships({
      workspace,
    });

    let updatedCount = 0;
    const errors: string[] = [];

    for (const membership of memberships) {
      const user = await UserResource.fetchByModelId(membership.userId);
      if (!user) {
        errors.push(`User not found: ${membership.userId}`);
        continue;
      }

      const currentRole = membership.role;
      const expectedRole = await determineUserRoleFromGroups(workspace, user);

      if (currentRole !== expectedRole) {
        const updateResult = await MembershipResource.updateMembershipRole({
          user,
          workspace,
          newRole: expectedRole,
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
