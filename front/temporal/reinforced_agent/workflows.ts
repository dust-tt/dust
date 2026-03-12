import type * as activities from "@app/temporal/reinforced_agent/activities";
import {
  ApplicationFailure,
  ParentClosePolicy,
  proxyActivities,
  setHandler,
  sleep,
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

const { startConversationAnalysisBatchActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "30 minutes",
});

const { checkBatchStatusActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

const { processConversationAnalysisBatchResultActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "30 minutes",
});

const { startAggregationBatchActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

const { processAggregationBatchResultActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "30 minutes",
});

const BATCH_POLL_INTERVAL_MIN_MS = 30_000; // 30 seconds (linear backoff start).
const BATCH_POLL_INTERVAL_MAX_MS = 5 * 60_000; // 5 minutes (linear backoff cap).
const BATCH_POLL_INTERVAL_STEP_MS = 10_000; // 10 seconds (linear backoff step).
const BATCH_TIMEOUT_MS = 6 * 60 * 60_000; // 6 hours.

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
 * Wait for a batch to complete.
 * Polls with linear backoff starting at 30 seconds, adding 10 seconds each time, capped at 5 minutes.
 * Throws a non-retryable error after 6 hours.
 */
async function waitForBatch({
  workspaceId,
  batchId,
}: {
  workspaceId: string;
  batchId: string;
}): Promise<void> {
  let elapsedMs = 0;
  let intervalMs = BATCH_POLL_INTERVAL_MIN_MS;

  while (elapsedMs < BATCH_TIMEOUT_MS) {
    await sleep(intervalMs);
    elapsedMs += intervalMs;
    intervalMs = Math.min(intervalMs + BATCH_POLL_INTERVAL_STEP_MS, BATCH_POLL_INTERVAL_MAX_MS);

    const status = await checkBatchStatusActivity({ workspaceId, batchId });
    if (status === "ready") {
      return;
    }
  }

  throw new ApplicationFailure(
    `Batch ${batchId} in workspace ${workspaceId} timed out after 6 hours.`,
    "BATCH_TIMEOUT",
    true // non-retryable
  );
}

/**
 * Agent-level workflow: analyze recent conversations then aggregate suggestions,
 * using batch LLM processing.
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

  // Phase 1: Batch-analyze all conversations.
  if (conversationIds.length > 0) {
    const analysisBatchId = await startConversationAnalysisBatchActivity({
      workspaceId,
      agentConfigurationId,
      conversationIds,
    });

    if (analysisBatchId) {
      await waitForBatch({ workspaceId, batchId: analysisBatchId });

      await processConversationAnalysisBatchResultActivity({
        workspaceId,
        agentConfigurationId,
        batchId: analysisBatchId,
      });
    }
  }

  // Phase 2: Batch-aggregate synthetic suggestions into pending.
  const aggregationBatchId = await startAggregationBatchActivity({
    workspaceId,
    agentConfigurationId,
  });

  if (aggregationBatchId) {
    await waitForBatch({ workspaceId, batchId: aggregationBatchId });

    await processAggregationBatchResultActivity({
      workspaceId,
      agentConfigurationId,
      batchId: aggregationBatchId,
    });
  }
}
