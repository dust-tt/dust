import {
  executeChild,
  proxyActivities,
  setHandler,
  workflowInfo,
} from "@temporalio/workflow";
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

const { purgeAgentConversationsBatchActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "15 minutes",
});

const { getAgentConfigurationsWithConversationsRetentionActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "15 minutes",
  });

export async function dataRetentionWorkflow(): Promise<void> {
  setHandler(runSignal, () => {
    // Empty handler - just receiving the signal will trigger a workflow execution.
  });

  const { workflowId, searchAttributes, memo } = workflowInfo();

  await executeChild(dataRetentionConversationWorkflow, {
    workflowId: `${workflowId}-conversations`,
    searchAttributes,
    args: [],
    memo,
  });

  await executeChild(dataRetentionAgentWorkflow, {
    workflowId: `${workflowId}-agents`,
    searchAttributes,
    args: [],
    memo,
  });
}

// This deletes conversations that are older than the conversation retention policy of the workspace.
export async function dataRetentionConversationWorkflow(): Promise<void> {
  const workspaceIds = await getWorkspacesWithConversationsRetentionActivity();
  const workspaceChunks = _.chunk(workspaceIds, 4);

  for (const workspaceChunk of workspaceChunks) {
    await purgeConversationsBatchActivity({
      workspaceIds: workspaceChunk,
    });
  }
}

// This deletes conversations that contains an agent mention with a retention policy.
// It doesn't matter if the message with the mention is older than the retention policy or not,
// we only check if the conversation is older than the retention policy.
export async function dataRetentionAgentWorkflow(): Promise<void> {
  const agentConfigs =
    await getAgentConfigurationsWithConversationsRetentionActivity();
  const agentConfigChunks = _.chunk(agentConfigs, 4);

  for (const agentConfigChunk of agentConfigChunks) {
    await purgeAgentConversationsBatchActivity({
      agentConfigs: agentConfigChunk,
    });
  }
}
