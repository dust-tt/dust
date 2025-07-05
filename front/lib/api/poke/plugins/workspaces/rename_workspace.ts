import { createPlugin } from "@app/lib/api/poke/types";
import { getWorkOS } from "@app/lib/api/workos/client";
import { changeWorkspaceName } from "@app/lib/api/workspace";
import { Err, normalizeError, Ok } from "@app/types";

export const renameWorkspace = createPlugin({
  manifest: {
    id: "rename-workspace",
    name: "Rename Workspace",
    description: "Change the name of the workspace",
    resourceTypes: ["workspaces"],
    args: {
      newName: {
        type: "string",
        label: "New Workspace Name",
        description: "The new name for the workspace",
      },
    },
  },
  execute: async (auth, _, args) => {
    const newName = args.newName.trim();
    if (newName.length < 5) {
      return new Err(
        new Error("Workspace name must be at least 5 characters long.")
      );
    }

    const res = await changeWorkspaceName(
      auth.getNonNullableWorkspace(),
      newName
    );
    if (res.isErr()) {
      return res;
    }

    const organization_id = auth.getNonNullableWorkspace().workOSOrganizationId;
    if (!organization_id) {
      return new Ok({
        display: "text",
        value: `Workspace renamed to ${newName}.`,
      });
    }

    try {
      await getWorkOS().organizations.updateOrganization({
        organization: organization_id,
        name: newName,
      });
    } catch (error) {
      const e = normalizeError(error);
      return new Err(
        new Error(`Failed to update WorkOS organization name: ${e.message}`)
      );
    }

    return new Ok({
      display: "text",
      value: `Workspace renamed to ${newName}. It was renamed in WorkOS as well.`,
    });
  },
});
