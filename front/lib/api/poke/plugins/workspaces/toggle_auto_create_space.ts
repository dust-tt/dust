import { createPlugin } from "@app/lib/api/poke/types";
import { updateWorkspaceMetadata } from "@app/lib/api/workspace";
import { Err, Ok } from "@app/types";

export const toggleAutoCreateSpacePlugin = createPlugin({
  manifest: {
    id: "toggle-auto-create-space-for-provisioned-groups",
    name: "Toggle Auto-Create Space for Provisioned Groups",
    description:
      "Enable/disable automatic space creation when SCIM-provisioned groups are created via WorkOS. " +
      "When enabled, a restricted space will be automatically created for each provisioned group.",
    resourceTypes: ["workspaces"],
    args: {
      enabled: {
        type: "boolean",
        label: "Enable Auto-Create Space",
        description:
          "When enabled, automatically creates a restricted space for each provisioned group",
      },
    },
  },
  execute: async (auth, workspace, args) => {
    if (!workspace) {
      return new Err(new Error("Cannot find workspace."));
    }

    const { enabled } = args;

    const result = await updateWorkspaceMetadata(workspace, {
      autoCreateSpaceForProvisionedGroups: enabled,
    });

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok({
      display: "text",
      value: enabled
        ? `✅ Auto-create space for provisioned groups is now ENABLED for workspace "${workspace.name}"`
        : `❌ Auto-create space for provisioned groups is now DISABLED for workspace "${workspace.name}"`,
    });
  },
});
