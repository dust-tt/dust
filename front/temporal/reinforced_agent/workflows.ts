import type * as activities from "@app/temporal/reinforced_agent/activities";
import {
  OpenTelemetryInboundInterceptor,
  OpenTelemetryInternalsInterceptor,
  OpenTelemetryOutboundInterceptor,
} from "@temporalio/interceptors-opentelemetry/lib/workflow";
import type { WorkflowInterceptorsFactory } from "@temporalio/workflow";
import {
  ApplicationFailure,
  executeChild,
  ParentClosePolicy,
  proxyActivities,
  setHandler,
  sleep,
} from "@temporalio/workflow";
import { concurrentExecutor } from "../utils";

import { runSignal } from "./signals";

// Export an interceptors variable to add OpenTelemetry interceptors to the workflow.
export const interceptors: WorkflowInterceptorsFactory = () => ({
  inbound: [new OpenTelemetryInboundInterceptor()],
  outbound: [new OpenTelemetryOutboundInterceptor()],
  internals: [new OpenTelemetryInternalsInterceptor()],
});

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

// Note on concurrency: we can reach (WORKSPACE_CONCURRENCY x AGENT_CONCURRENCY) simulateneous workflows
// and it may be way higher than the worker's maxConcurrentActivityTaskExecutions but this is OK
// as a lot of the time will be spent waiting for the batch to finish so many workflows should not
// have any activity running.
const WORKSPACE_CONCURRENCY = 8;
const AGENT_CONCURRENCY = 8;
const CONVERSATION_ANALYSIS_CONCURRENCY = 4;

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

  await concurrentExecutor(
    workspaceIds,
    (workspaceId) =>
      executeChild(reinforcedAgentWorkspaceWorkflow, {
        workflowId: `reinforced-agent-workspace-${workspaceId}`,
        args: [{ workspaceId, useBatchMode: true }],
        parentClosePolicy: ParentClosePolicy.ABANDON,
      }),
    { concurrency: WORKSPACE_CONCURRENCY }
  );
}

/**
 * Workspace-level workflow: list active agents and start a child workflow for each.
 */
export async function reinforcedAgentWorkspaceWorkflow({
  workspaceId,
  useBatchMode,
}: {
  workspaceId: string;
  useBatchMode: boolean;
}): Promise<void> {
  const agentIds = await getAgentConfigurationsActivity({ workspaceId });

  await concurrentExecutor(
    agentIds,
    (agentConfigurationId) =>
      executeChild(reinforcedAgentForAgentWorkflow, {
        workflowId: `reinforced-agent-${workspaceId}-${agentConfigurationId}`,
        args: [{ workspaceId, agentConfigurationId, useBatchMode }],
        parentClosePolicy: ParentClosePolicy.ABANDON,
      }),
    { concurrency: AGENT_CONCURRENCY }
  );
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
    intervalMs = Math.min(
      intervalMs + BATCH_POLL_INTERVAL_STEP_MS,
      BATCH_POLL_INTERVAL_MAX_MS
    );

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
 * Agent-level workflow: analyze recent conversations then aggregate suggestions.
 * Uses batch LLM processing when useBatchMode is true, sequential streaming otherwise.
 */
export async function reinforcedAgentForAgentWorkflow({
  workspaceId,
  agentConfigurationId,
  useBatchMode,
  conversationLookbackDays = 1,
  disableNotifications = false,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  useBatchMode: boolean;
  conversationLookbackDays?: number;
  disableNotifications?: boolean;
}): Promise<void> {
  const conversationIds = await getRecentConversationsForAgentActivity({
    workspaceId,
    agentConfigurationId,
    conversationLookbackDays,
  });

  if (useBatchMode) {
    // Phase 1: Batch-analyze all conversations.
    if (conversationIds.length > 0) {
      const analysisResult = await startConversationAnalysisBatchActivity({
        workspaceId,
        agentConfigurationId,
        analysedConversationIds: conversationIds,
      });

      if (analysisResult) {
        await waitForBatch({ workspaceId, batchId: analysisResult.batchId });

        await processConversationAnalysisBatchResultActivity({
          workspaceId,
          agentConfigurationId,
          batchId: analysisResult.batchId,
          reinforcementConversationIds:
            analysisResult.reinforcementConversationIds,
          analysedConversationIds: analysisResult.analysedConversationIds,
        });
      }
    }

    // Phase 2: Batch-aggregate synthetic suggestions into pending.
    const aggregationResult = await startAggregationBatchActivity({
      workspaceId,
      agentConfigurationId,
    });

    if (aggregationResult) {
      await waitForBatch({ workspaceId, batchId: aggregationResult.batchId });

      await processAggregationBatchResultActivity({
        workspaceId,
        agentConfigurationId,
        batchId: aggregationResult.batchId,
        reinforcementConversationIds:
          aggregationResult.reinforcementConversationIds,
        disableNotifications,
      });
    }
  } else {
    // Phase 1: Analyze all conversations in parallel via streaming.
    await concurrentExecutor(
      conversationIds,
      (conversationId) =>
        analyzeConversationActivity({
          workspaceId,
          agentConfigurationId,
          conversationId,
        }),
      { concurrency: CONVERSATION_ANALYSIS_CONCURRENCY }
    );

    // Phase 2: Aggregate synthetic suggestions into pending.
    await aggregateSuggestionsActivity({
      workspaceId,
      agentConfigurationId,
      disableNotifications,
    });
  }
}
