import { createPlugin } from "@app/lib/api/poke/types";
import {
  CONVERSATIONS_RETENTION_MIN_DAYS,
  isValidConversationsRetentionDays,
} from "@app/lib/conversations_retention";
import { getConversationsDataRetention } from "@app/lib/data_retention";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { Err, Ok } from "@app/types/shared/result";

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
        description: `Number of days to retain conversations (${CONVERSATIONS_RETENTION_MIN_DAYS}+ days, or -1 for unlimited)`,
        async: true,
      },
    },
  },
  populateAsyncArgs: async (auth) => {
    const retentionDays = await getConversationsDataRetention(auth);

    return new Ok({
      retentionDays: retentionDays ?? -1,
    });
  },
  execute: async (auth, _, args) => {
    const retentionDays = args.retentionDays ?? -1;

    if (
      retentionDays !== -1 &&
      !isValidConversationsRetentionDays(retentionDays)
    ) {
      return new Err(
        new Error(
          `Set -1 to remove the retention rule, or a number >= ${CONVERSATIONS_RETENTION_MIN_DAYS} to set the retention rule.`
        )
      );
    }

    const res = await WorkspaceResource.updateConversationsRetention(
      auth.getNonNullableWorkspace().id,
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
