import { createPlugin } from "@app/lib/api/poke/types";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export const applyGroupRoles = createPlugin({
  manifest: {
    id: "apply-roles-from-groups",
    name: "Apply group roles",
    description: "Force resync roles from role-granting groups",
    resourceTypes: ["workspaces"],
    warning:
      "This action will override the existing membership roles based on the workspace's role-granting groups (groups mapped to a role). " +
      "Make sure the user is aware of this and does not want to keep the roles assigned manually.",
    args: {},
    requiredRoles: ["engineering"],
  },
  execute: async (auth) => {
    const workspace = auth.getNonNullableWorkspace();

    const roleGrantingGroups =
      await GroupResource.listRoleGrantingGroupsForWorkspace(auth);
    if (roleGrantingGroups.length === 0) {
      return new Ok({
        display: "text",
        value: "No role-granting group found in this workspace.",
      });
    }

    const { memberships } = await MembershipResource.getActiveMemberships({
      workspace,
    });
    const users = await UserResource.fetchByModelIds([
      ...new Set(memberships.map((m) => m.userId)),
    ]);

    try {
      await GroupResource.recomputeAndSyncWorkspaceRolesForUsers(auth, users);
    } catch (error) {
      return new Err(normalizeError(error));
    }

    const groupSummary = roleGrantingGroups
      .map((g) => `${g.name} → ${g.grantedRole} (${g.sId})`)
      .join(", ");

    return new Ok({
      display: "json",
      value: {
        status: "success",
        message: `Successfully synced membership roles for workspace "${workspace.name}".`,
        groupSummary,
      },
    });
  },
});
