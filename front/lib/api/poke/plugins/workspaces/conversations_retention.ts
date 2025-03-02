import { Err, Ok } from "@dust-tt/types";

import { createPlugin } from "@app/lib/api/poke/types";
import { updateWorkspaceConversationsRetention } from "@app/lib/api/workspace";

export const conversationsRetentionPlugin = createPlugin({
  manifest: {
    id: "conversations-retention",
    name: "Change Conversations Retention",
    description: "Change how long conversations are retained in the workspace",
    resourceTypes: ["workspaces"],
    args: {
      retentionDays: {
        type: "number",
        label: "Retention Days",
        description:
          "Number of days to retain conversations (-1 for unlimited)",
      },
    },
  },
  execute: async (auth, _, args) => {
    const retentionDays = args.retentionDays;

    if (retentionDays !== -1 && retentionDays < 1) {
      return new Err(
        new Error(
          "Set -1 to remove the retention rule, or a number > 0 to set the retention rule."
        )
      );
    }

    const res = await updateWorkspaceConversationsRetention(
      auth.getNonNullableWorkspace(),
      retentionDays
    );
    if (res.isErr()) {
      return res;
    }

    return new Ok({
      display: "text",
      value: `Conversations retention period set to ${retentionDays === -1 ? "unlimited" : `${retentionDays} days`}.`,
    });
  },
});
