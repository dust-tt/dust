import { createPlugin } from "@app/lib/api/poke/types";
import { renameWorkspace } from "@app/lib/api/workspace";
import { Err, Ok } from "@app/types/shared/result";

export const renameWorkspacePlugin = createPlugin({
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

    const res = await renameWorkspace(auth.getNonNullableWorkspace(), newName);
    if (res.isErr()) {
      return res;
    }

    return new Ok({
      display: "text",
      value: `Workspace renamed to ${newName} (DB, WorkOS, Metronome).`,
    });
  },
});
