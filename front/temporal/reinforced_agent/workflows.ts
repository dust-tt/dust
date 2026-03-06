import type * as activities from "@app/temporal/reinforced_agent/activities";
import {
  ParentClosePolicy,
  proxyActivities,
  setHandler,
  startChild,
} from "@temporalio/workflow";

import { runSignal } from "./signals";

const { getFlaggedWorkspacesActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

const { getAgentConfigurationsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

const { getRecentConversationsForAgentActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
});

const { analyzeConversationActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

const { aggregateSuggestionsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

/**
 * Top-level workflow: find flagged workspaces and start a child workflow for each.
 */
export async function reinforcedAgentWorkflow(): Promise<void> {
  setHandler(runSignal, () => {
    // Empty handler — receiving the signal triggers a workflow execution.
  });

  const workspaceIds = await getFlaggedWorkspacesActivity();

  for (const workspaceId of workspaceIds) {
    await startChild(reinforcedAgentWorkspaceWorkflow, {
      workflowId: `reinforced-agent-workspace-${workspaceId}`,
      args: [{ workspaceId }],
      parentClosePolicy: ParentClosePolicy.ABANDON,
    });
  }
}

/**
 * Workspace-level workflow: list active agents and start a child workflow for each.
 */
export async function reinforcedAgentWorkspaceWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  const agentIds = await getAgentConfigurationsActivity({ workspaceId });

  for (const agentConfigurationId of agentIds) {
    await startChild(reinforcedAgentForAgentWorkflow, {
      workflowId: `reinforced-agent-${workspaceId}-${agentConfigurationId}`,
      args: [{ workspaceId, agentConfigurationId }],
      parentClosePolicy: ParentClosePolicy.ABANDON,
    });
  }
}

/**
 * Agent-level workflow: analyze recent conversations then aggregate suggestions.
 */
export async function reinforcedAgentForAgentWorkflow({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
}): Promise<void> {
  const conversationIds = await getRecentConversationsForAgentActivity({
    workspaceId,
    agentConfigurationId,
  });

  // Phase 1: Analyze each conversation.
  for (const conversationId of conversationIds) {
    await analyzeConversationActivity({
      workspaceId,
      agentConfigurationId,
      conversationId,
    });
  }

  // Phase 2: Aggregate synthetic suggestions into pending.
  await aggregateSuggestionsActivity({
    workspaceId,
    agentConfigurationId,
  });
}
