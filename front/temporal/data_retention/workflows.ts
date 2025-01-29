import { proxyActivities, setHandler } from "@temporalio/workflow";
import _ from "lodash";

import type * as activities from "@app/temporal/data_retention/activities";

import { runSignal } from "./signals";

const { getWorkspacesWithConversationsRetentionActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
});

const { purgeConversationsBatchActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "15 minutes",
});

export async function dataRetentionWorkflow(): Promise<void> {
  setHandler(runSignal, () => {
    // Empty handler - just receiving the signal will trigger a workflow execution.
  });

  const workspaceIds = await getWorkspacesWithConversationsRetentionActivity();
  const workspaceChunks = _.chunk(workspaceIds, 4);

  for (const workspaceChunk of workspaceChunks) {
    await purgeConversationsBatchActivity({
      workspaceIds: workspaceChunk,
    });
  }
}
