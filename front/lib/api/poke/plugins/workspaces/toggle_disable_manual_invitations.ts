import { createPlugin } from "@app/lib/api/poke/types";
import { updateWorkspaceMetadata } from "@app/lib/api/workspace";
import { Err, Ok } from "@app/types";

export const toggleDisableManualInvitationsPlugin = createPlugin({
  manifest: {
    id: "toggle-disable-manual-invitations",
    name: "Toggle Disable Manual Invitations",
    description:
      "Enable/disable manual user invitations. " +
      "When enabled, the 'Invite members' button will be hidden. Existing invitations will not be affected, and emmbers can still be invited with poke plugin.",
    resourceTypes: ["workspaces"],
    args: {
      disabled: {
        type: "boolean",
        label: "Disable Manual Invitations",
        description:
          "When checked, manual invitations via the 'Invite members' button will be disabled",
      },
    },
  },
  execute: async (auth, workspace, args) => {
    if (!workspace) {
      return new Err(new Error("Cannot find workspace."));
    }

    const { disabled } = args;

    const result = await updateWorkspaceMetadata(workspace, {
      disableManualInvitations: disabled,
    });

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok({
      display: "text",
      value: disabled
        ? `Manual invitations are now DISABLED for workspace "${workspace.name}". The 'Invite members' button will be hidden.`
        : `Manual invitations are now ENABLED for workspace "${workspace.name}". The 'Invite members' button will be visible.`,
    });
  },
});
