import { createPlugin } from "@app/lib/api/poke/types";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { Err, Ok } from "@app/types";

const ALL_ADMINS = "all_admins";
const FIRST_ADMIN_ONLY = "first_admin_only";

export const getAdminsForWorkspacesPlugin = createPlugin({
  manifest: {
    id: "get-admins-for-workspaces",
    name: "Get Admins for Workspaces",
    description: "Retrieve admin users for a list of workspaces",
    resourceTypes: ["global"],
    args: {
      workspaceIds: {
        type: "string",
        label: "Workspace IDs",
        description: "Comma or space-separated list of workspace sIds",
      },
      returnType: {
        type: "enum",
        label: "Return Type",
        description: "Whether to return first admin only or all admins",
        values: [
          { label: "First Admin Only", value: FIRST_ADMIN_ONLY },
          { label: "All Admins", value: ALL_ADMINS },
        ],
        multiple: false,
      },
    },
  },
  execute: async (_, __, args) => {
    const sIds = args.workspaceIds
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (!sIds.length) {
      return new Err(new Error("No workspace IDs provided"));
    }

    const workspaces = await WorkspaceResource.fetchByIds(sIds);
    const missing = sIds.filter(
      (sId) => !workspaces.find((w) => w.sId === sId)
    );

    const admins = new Set<string>();

    for (const workspace of workspaces) {
      const { memberships } = await MembershipResource.getActiveMemberships({
        workspace: renderLightWorkspaceType({ workspace }),
        roles: ["admin"],
      });

      const toAdd =
        args.returnType[0] === FIRST_ADMIN_ONLY
          ? memberships
              .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
              .slice(0, 1)
          : memberships;

      toAdd.forEach((m) => m.user && admins.add(m.user.email));
    }

    return new Ok({
      display: "json",
      value: {
        admins: Array.from(admins),
        count: admins.size,
        returnType: args.returnType,
        workspacesCount: workspaces.length,
        missingWorkspaces: missing,
      },
    });
  },
});
