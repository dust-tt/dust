import { Ok } from "@dust-tt/types";

import { createPlugin } from "@app/lib/api/poke/types";
import { changeWorkspaceName } from "@app/lib/api/workspace";

export const renameWorkspace = createPlugin(
  {
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
  async (auth, resourceId, args) => {
    const res = await changeWorkspaceName(
      auth.getNonNullableWorkspace(),
      args.newName
    );
    if (res.isErr()) {
      return res;
    }

    return new Ok(`Workspace renamed to ${args.newName}.`);
  }
);
