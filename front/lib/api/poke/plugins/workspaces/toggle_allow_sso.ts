import { createPlugin } from "@app/lib/api/poke/types";
import { updateWorkspaceMetadata } from "@app/lib/api/workspace";
import { Err, Ok } from "@app/types/shared/result";

export const toggleAllowSSOPlugin = createPlugin({
  manifest: {
    id: "toggle-allow-sso",
    name: "Toggle SSO Activation",
    description:
      "Enable/disable SSO for a workspace regardless of its plan. " +
      "Used to activate SSO on demand for plans where it is not included by default " +
      "(e.g. Business plans). Note: disabling only removes the workspace-level override; " +
      "SSO remains available if the plan allows it.",
    resourceTypes: ["workspaces"],
    args: {
      enabled: {
        type: "boolean",
        variant: "toggle",
        label: "Enable SSO",
        description:
          "When enabled, SSO is available for this workspace even if its plan does not allow it",
        async: true,
      },
    },
    requiredRoles: ["support"],
  },
  populateAsyncArgs: async (auth, workspace) => {
    return new Ok({
      enabled: workspace?.metadata?.allowSSO === true,
    });
  },
  execute: async (auth, workspace, args) => {
    if (!workspace) {
      return new Err(new Error("Cannot find workspace."));
    }

    const { enabled } = args;

    const result = await updateWorkspaceMetadata(workspace, {
      allowSSO: enabled,
    });

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok({
      display: "text",
      value: enabled
        ? `✅ SSO is now ENABLED for workspace "${workspace.name}" (workspace-level override)`
        : `❌ SSO workspace-level override is now DISABLED for workspace "${workspace.name}" (SSO remains available if the plan allows it)`,
    });
  },
});
