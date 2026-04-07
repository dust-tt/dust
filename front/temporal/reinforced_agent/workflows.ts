import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/reinforced_agent/activities";
import type { AgentLoopArgsWithTiming } from "@app/types/assistant/agent_run";
import type { ModelId } from "@app/types/shared/model_id";
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
  sleep,
} from "@temporalio/workflow";
import { concurrentExecutor } from "../utils";

// Export an interceptors variable to add OpenTelemetry interceptors to the workflow.
export const interceptors: WorkflowInterceptorsFactory = () => ({
  inbound: [new OpenTelemetryInboundInterceptor()],
  outbound: [new OpenTelemetryOutboundInterceptor()],
  internals: [new OpenTelemetryInternalsInterceptor()],
});

const { isAgentReinforcementAllowedActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
});

const { getAgentConfigurationsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

const { getRecentConversationsForAgentActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
});

const { finalizeAggregationActivity } = proxyActivities<typeof activities>({
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

const { analyzeConversationStepActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

const { aggregateSuggestionsStepActivity } = proxyActivities<typeof activities>(
  {
    startToCloseTimeout: "10 minutes",
  }
);

// runToolActivity is re-exported from the agent loop so the reinforced agent
// worker registers it. We proxy it with retry for durability.
const { runToolActivity: runRetryableToolActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "10 minutes",
  retry: { maximumAttempts: 3 },
});

// Duplicated here because Temporal workflow sandbox can't resolve @app/lib imports.
const MAX_REINFORCED_ANALYSIS_STEPS = 4;

const AGENT_CONCURRENCY = 8;
const CONVERSATION_ANALYSIS_CONCURRENCY = 4;

const BATCH_POLL_INTERVAL_MIN_MS = 30_000; // 30 seconds (linear backoff start).
const BATCH_POLL_INTERVAL_MAX_MS = 5 * 60_000; // 5 minutes (linear backoff cap).
const BATCH_POLL_INTERVAL_STEP_MS = 10_000; // 10 seconds (linear backoff step).
const BATCH_TIMEOUT_MS = 6 * 60 * 60_000; // 6 hours.

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/**
 * Compute a deterministic delay (0 to 2 hours) from a workspace ID string.
 * This spreads cron-triggered executions across the midnight–2am window
 * without using non-deterministic APIs (safe for Temporal replay).
 */
function computeWorkspaceDelayMs(workspaceId: string): number {
  let hash = 0;
  for (const ch of workspaceId) {
    hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  }
  return Math.abs(hash) % TWO_HOURS_MS;
}

/**
 * Workspace-level workflow (one per workspace, cron-scheduled).
 * When `skipDelay` is false (cron runs), sleeps a deterministic delay derived
 * from the workspace ID to spread load across the midnight–2am window.
 * When `skipDelay` is true (manual runs), starts immediately.
 */
export async function reinforcedAgentWorkspaceWorkflow({
  workspaceId,
  useBatchMode,
  skipDelay = false,
  includeAutoAgents = true,
}: {
  workspaceId: string;
  useBatchMode: boolean;
  skipDelay?: boolean;
  includeAutoAgents?: boolean;
}): Promise<void> {
  const isAllowed = await isAgentReinforcementAllowedActivity({ workspaceId });
  if (!isAllowed) {
    return;
  }

  if (!skipDelay) {
    const delayMs = computeWorkspaceDelayMs(workspaceId);
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const selections = await getAgentConfigurationsActivity({
    workspaceId,
    includeAutoAgents,
  });

  await concurrentExecutor(
    selections,
    ({ agentConfigurationId, conversationsToSample }) =>
      executeChild(reinforcedAgentForAgentWorkflow, {
        workflowId: `reinforced-agent-${workspaceId}-${agentConfigurationId}`,
        args: [
          {
            workspaceId,
            agentConfigurationId,
            useBatchMode,
            conversationsToSample,
          },
        ],
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
  disableNotifications = false,
  conversationsToSample,
  conversationLookbackDays,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  useBatchMode: boolean;
  disableNotifications?: boolean;
  conversationsToSample?: number;
  conversationLookbackDays?: number;
}): Promise<void> {
  const conversationIds = await getRecentConversationsForAgentActivity({
    workspaceId,
    agentConfigurationId,
    conversationLookbackDays,
    maxConversations: conversationsToSample,
  });

  // No conversations to analyze: skip both analysis and aggregation.
  if (conversationIds.length === 0) {
    return;
  }

  if (useBatchMode) {
    // Phase 1: Batch-analyze all conversations with multi-step loop.
    // Each iteration: submit batch → wait → process results → execute tools.
    // Conversations that called terminal tools are done; the rest continue.
    let pendingConversationIds = conversationIds;
    let reinforcementConversationMap: Record<string, string> | undefined;
    let step = 0;

    while (
      step < MAX_REINFORCED_ANALYSIS_STEPS &&
      pendingConversationIds.length > 0
    ) {
      const batchResult = await startConversationAnalysisBatchActivity({
        workspaceId,
        agentConfigurationId,
        analysedConversationIds: pendingConversationIds,
        existingReinforcementConversationMap: reinforcementConversationMap,
      });

      if (!batchResult) {
        break;
      }

      await waitForBatch({ workspaceId, batchId: batchResult.batchId });

      reinforcementConversationMap = batchResult.reinforcementConversationMap;

      const continuations =
        await processConversationAnalysisBatchResultActivity({
          workspaceId,
          agentConfigurationId,
          batchId: batchResult.batchId,
          reinforcementConversationMap,
        });

      if (continuations.length === 0) {
        break;
      }

      // Execute exploratory tools via the agent loop's retryable tool activity.
      // Results are stored in the reinforcement conversations in DB.
      for (const c of continuations) {
        if (c.toolActionInfo) {
          await executeReinforcedToolActions(c.toolActionInfo);
        }
      }

      // Next iteration will re-submit only the continuing conversations,
      // reusing their reinforcement conversations (which now include tool results).
      pendingConversationIds = continuations.map(
        (c) => c.analysedConversationId
      );
      step++;
    }

    // Phase 2: Batch-aggregate synthetic suggestions into pending (multi-step).
    await aggregateWithMultiStepBatch({
      workspaceId,
      agentConfigurationId,
      disableNotifications,
    });
  } else {
    // Phase 1: Analyze all conversations in parallel via streaming (multi-step).
    await concurrentExecutor(
      conversationIds,
      (conversationId) =>
        analyzeConversationWithMultiStep({
          workspaceId,
          agentConfigurationId,
          conversationId,
        }),
      { concurrency: CONVERSATION_ANALYSIS_CONCURRENCY }
    );

    // Phase 2: Aggregate synthetic suggestions into pending (multi-step).
    await aggregateWithMultiStep({
      workspaceId,
      agentConfigurationId,
      disableNotifications,
    });
  }
}

interface ReinforcedToolActionInfo {
  authType: AuthenticatorType;
  agentLoopArgs: AgentLoopArgsWithTiming;
  actionIds: ModelId[];
}

// Matches the return type of analyzeConversationStepActivity / aggregateSuggestionsStepActivity.
interface ReinforcedStepResult {
  isTerminal: boolean;
  suggestionsCreated: number;
  reinforcementConversationId?: string;
  toolActionInfo?: ReinforcedToolActionInfo;
}

/**
 * Execute tool actions from a reinforced step result.
 * Wraps each tool execution in try/catch — if it fails after all retries,
 * the rendering pipeline injects a placeholder error for the LLM to see.
 */
async function executeReinforcedToolActions(
  toolActionInfo: ReinforcedToolActionInfo
): Promise<void> {
  const { authType, agentLoopArgs, actionIds } = toolActionInfo;
  for (const actionId of actionIds) {
    try {
      await runRetryableToolActivity(authType, {
        actionId,
        runAgentArgs: agentLoopArgs,
        step: 0,
      });
    } catch {
      // Tool execution failed after all retries.
      // The AgentMCPActionResource exists but has no output — the rendering
      // pipeline will inject a placeholder error for the LLM to see.
    }
  }
}

/**
 * Shared multi-step streaming loop for reinforced agent operations.
 * Calls the step activity, executes exploratory tools, and loops until terminal.
 *
 * Tool results are stored in the reinforcement conversation by runRetryableToolActivity.
 * On the next step, the step activity renders the full conversation from DB via
 * renderConversationForModel — no need to pass continuation messages explicitly.
 */
async function runMultiStepStreamingLoop(
  stepFn: (
    reinforcementConversationId: string | undefined
  ) => Promise<ReinforcedStepResult>
): Promise<{ suggestionsCreated: number }> {
  let reinforcementConversationId: string | undefined;
  let totalSuggestionsCreated = 0;

  for (let step = 0; step < MAX_REINFORCED_ANALYSIS_STEPS; step++) {
    const result = await stepFn(reinforcementConversationId);

    reinforcementConversationId = result.reinforcementConversationId;
    totalSuggestionsCreated += result.suggestionsCreated;

    if (result.isTerminal) {
      break;
    }

    if (result.toolActionInfo) {
      await executeReinforcedToolActions(result.toolActionInfo);
    }
  }

  return { suggestionsCreated: totalSuggestionsCreated };
}

/**
 * Multi-step streaming analysis of a single conversation (non batch mode).
 */
async function analyzeConversationWithMultiStep({
  workspaceId,
  agentConfigurationId,
  conversationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  conversationId: string;
}): Promise<void> {
  await runMultiStepStreamingLoop((reinforcementConversationId) =>
    analyzeConversationStepActivity({
      workspaceId,
      agentConfigurationId,
      conversationId,
      reinforcementConversationId,
    })
  );
}

/**
 * Multi-step streaming aggregation (non-batch mode).
 */
async function aggregateWithMultiStep({
  workspaceId,
  agentConfigurationId,
  disableNotifications,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  disableNotifications: boolean;
}): Promise<void> {
  const { suggestionsCreated } = await runMultiStepStreamingLoop(
    (reinforcementConversationId) =>
      aggregateSuggestionsStepActivity({
        workspaceId,
        agentConfigurationId,
        reinforcementConversationId,
      })
  );

  await finalizeAggregationActivity({
    workspaceId,
    agentConfigurationId,
    suggestionsCreated,
    disableNotifications,
  });
}

/**
 * Multi-step batch aggregation.
 */
async function aggregateWithMultiStepBatch({
  workspaceId,
  agentConfigurationId,
  disableNotifications,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  disableNotifications: boolean;
}): Promise<void> {
  let reinforcementConversationId: string | undefined;
  let totalSuggestionsCreated = 0;

  for (let step = 0; step < MAX_REINFORCED_ANALYSIS_STEPS; step++) {
    const batchResult = await startAggregationBatchActivity({
      workspaceId,
      agentConfigurationId,
      existingReinforcementConversationId: reinforcementConversationId,
    });

    if (!batchResult) {
      break;
    }

    await waitForBatch({ workspaceId, batchId: batchResult.batchId });

    const result = await processAggregationBatchResultActivity({
      workspaceId,
      agentConfigurationId,
      batchId: batchResult.batchId,
      reinforcementConversationIds: batchResult.reinforcementConversationIds,
    });

    totalSuggestionsCreated += result.suggestionsCreated;

    if (!result.needsContinuation) {
      break;
    }

    reinforcementConversationId = result.reinforcementConversationId;

    if (result.toolActionInfo) {
      await executeReinforcedToolActions(result.toolActionInfo);
    }
  }

  await finalizeAggregationActivity({
    workspaceId,
    agentConfigurationId,
    suggestionsCreated: totalSuggestionsCreated,
    disableNotifications,
  });
}
