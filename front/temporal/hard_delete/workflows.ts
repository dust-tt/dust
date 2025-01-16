import { proxyActivities } from "@temporalio/workflow";
import _ from "lodash";

import type * as activities from "@app/temporal/hard_delete/activities";

// TODO(2024-06-13 flav) Lower `startToCloseTimeout` to 10 minutes.
const { purgeExpiredRunExecutionsActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "60 minutes",
});
const {
  getWorkspacesWithConversationsRetentionActivity,
  purgeConversationsBatchActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "15 minutes",
});

export async function purgeRunExecutionsCronWorkflow(): Promise<void> {
  await purgeExpiredRunExecutionsActivity();
}

export async function purgeDataRetentionWorkflow(): Promise<void> {
  const workspaceIds = await getWorkspacesWithConversationsRetentionActivity();
  const workspaceChunks = _.chunk(workspaceIds, 4);

  for (const workspaceChunk of workspaceChunks) {
    await purgeConversationsBatchActivity({
      workspaceIds: workspaceChunk,
    });
  }
}
