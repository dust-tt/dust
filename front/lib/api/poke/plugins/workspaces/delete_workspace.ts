import { createPlugin } from "@app/lib/api/poke/types";
import { deleteWorkspace } from "@app/lib/api/workspace";
import { FREE_NO_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { Ok } from "@app/types";
import { Err } from "@app/types";

export const deleteWorkspacePlugin = createPlugin({
  manifest: {
    id: "delete-workspace",
    name: "Delete Workspace",
    description: "Delete a workspace.",
    resourceTypes: ["workspaces"],
    args: {
      confirmation: {
        type: "string",
        description: "Type 'DELETE' to confirm deletion",
        label: "Type 'DELETE' to confirm",
      },
      workspaceHasBeenRelocated: {
        type: "boolean",
        description: "Whether the workspace has been relocated",
        label: "Purge workspace data in this region following a relocation",
      },
    },
  },
  execute: async (
    auth,
    workspace,
    { confirmation, workspaceHasBeenRelocated }
  ) => {
    if (!workspace) {
      return new Err(new Error("Workspace not found"));
    }

    if (confirmation !== "DELETE") {
      return new Err(new Error("Invalid confirmation, must type 'DELETE'"));
    }

    // If the workspace has been relocated, we can delete it immediately.
    if (workspaceHasBeenRelocated) {
      await deleteWorkspace(workspace, { workspaceHasBeenRelocated });
    } else {
      // If the workspace has not been relocated, we need to check if it has data sources or a
      // paid plan.
      const dataSources = await DataSourceResource.listByWorkspace(auth);
      if (dataSources.length > 0) {
        return new Err(
          new Error(
            "Workspace has data sources, please delete them before deleting the workspace."
          )
        );
      }
      const subscription = auth.getNonNullableSubscription();
      if (subscription.plan.code !== FREE_NO_PLAN_CODE) {
        return new Err(
          new Error(
            "Workspace has a paid plan, please downgrade to a free plan before deleting the workspace."
          )
        );
      }

      await deleteWorkspace(workspace);
    }

    return new Ok({
      display: "text",
      value: "Workspace scheduled for deletion",
    });
  },
});
