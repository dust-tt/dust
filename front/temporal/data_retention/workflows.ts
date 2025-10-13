import { proxyActivities, setHandler } from "@temporalio/workflow";
import _ from "lodash";

import type * as activities from "@app/temporal/data_retention/activities";

import { runSignal } from "./signals";

const {
  getWorkspacesWithConversationsRetentionActivity,
  getAgentsWithConversationsRetentionActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

const {
  purgeConversationsBatchActivity,
  purgeAgentConversationsBatchActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  heartbeatTimeout: "5 minutes",
});

export async function dataRetentionWorkflow(): Promise<void> {
  setHandler(runSignal, () => {
    // Empty handler - just receiving the signal will trigger a workflow execution.
  });

  // First the Workspace level data retention.
  const workspaceIds = await getWorkspacesWithConversationsRetentionActivity();
  const workspaceChunks = _.chunk(workspaceIds, 4);

  for (const workspaceChunk of workspaceChunks) {
    await purgeConversationsBatchActivity({
      workspaceIds: workspaceChunk,
    });
  }

  // Then the Agent level data retention.
  const agentsWithDataRetention =
    await getAgentsWithConversationsRetentionActivity();

  for (const agentWithDataRetention of agentsWithDataRetention) {
    await purgeAgentConversationsBatchActivity({
      agentConfigurationId: agentWithDataRetention.agentConfigurationId,
      workspaceId: agentWithDataRetention.workspaceId,
      retentionDays: agentWithDataRetention.retentionDays,
    });
  }
}
