import { createPlugin } from "@app/lib/api/poke/types";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { Err, Ok } from "@app/types/shared/result";

export const disableSSOPlugin = createPlugin({
  manifest: {
    id: "disable-sso",
    name: "Disable SSO Enforcement",
    description: "Disable SSO enforcement on a workspace",
    resourceTypes: ["workspaces"],
    args: {
      force: {
        type: "boolean",
        label: "Force",
        description: "Are you sure?",
      },
    },
  },
  execute: async (auth, workspace, args) => {
    if (!workspace) {
      return new Err(new Error("Cannot find workspace."));
    }

    const { force } = args;
    if (!force) {
      return new Err(
        new Error("You must confirm that you want to disable SSO enforcement.")
      );
    }

    const res = await WorkspaceResource.disableSSOEnforcement(workspace.id);

    if (res.isErr()) {
      return new Err(res.error);
    }

    return new Ok({
      display: "text",
      value: "SSO enforcement disabled.",
    });
  },
});
