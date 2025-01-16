import { proxyActivities } from "@temporalio/workflow";
import _ from "lodash";

import type * as activities from "@app/temporal/data_retention/activities";

const {
  getWorkspacesWithConversationsRetentionActivity,
  purgeConversationsBatchActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "15 minutes",
});

export async function purgeDataRetentionWorkflow(): Promise<void> {
  const workspaceIds = await getWorkspacesWithConversationsRetentionActivity();
  const workspaceChunks = _.chunk(workspaceIds, 4);

  for (const workspaceChunk of workspaceChunks) {
    await purgeConversationsBatchActivity({
      workspaceIds: workspaceChunk,
    });
  }
}
