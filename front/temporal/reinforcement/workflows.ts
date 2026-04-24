import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/reinforcement/activities";
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
  proxyActivities,
  sleep,
} from "@temporalio/workflow";
import { concurrentExecutor } from "../workflow_utils";

// Export an interceptors variable to add OpenTelemetry interceptors to the workflow.
export const interceptors: WorkflowInterceptorsFactory = () => ({
  inbound: [new OpenTelemetryInboundInterceptor()],
  outbound: [new OpenTelemetryOutboundInterceptor()],
  internals: [new OpenTelemetryInternalsInterceptor()],
});

const {
  ensureReinforcementWorkspaceSchedulesActivity:
    ensureReinforcementWorkspaceSchedulesActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
});

const { getReinforcementSettingsActivity } = proxyActivities<typeof activities>(
  {
    startToCloseTimeout: "5 minutes",
  }
);

const { getRecentConversationsWithSkillsActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
});

const { analyzeConversationStepActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

const { getSkillsWithSyntheticSuggestionsActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
});

const { aggregateSuggestionsForSkillStepActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "10 minutes",
});

const { finalizeSkillAggregationActivity } = proxyActivities<typeof activities>(
  {
    startToCloseTimeout: "5 minutes",
  }
);

const { checkBatchStatusActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

const {
  startSkillConversationAnalysisBatchActivity,
  startSkillAggregationBatchActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
});

const {
  processSkillConversationAnalysisBatchResultActivity,
  processSkillAggregationBatchResultActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
});

// runToolActivity is re-exported from the agent loop so the reinforced skills
// worker registers it. We proxy it with retry for durability.
const { runToolActivity: runRetryableToolActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "10 minutes",
  retry: { maximumAttempts: 3 },
});

// Duplicated here because Temporal workflow sandbox can't resolve @app/lib imports.
const MAX_REINFORCED_ANALYSIS_STEPS = 4;

const CONVERSATION_ANALYSIS_CONCURRENCY = 4;
const SKILL_AGGREGATION_CONCURRENCY = 8;

const BATCH_POLL_INTERVAL_MIN_MS = 30_000; // 30 seconds (exponential backoff start).
const BATCH_POLL_INTERVAL_MAX_MS = 30 * 60_000; // 30 minutes (exponential backoff cap).
const BATCH_TIMEOUT_MS = 24 * 60 * 60_000 + 5 * 60_000; // 24 hours + 5 minutes (to guarantee we wait longer than Anthropic's batch limit).

/**
 * Wait for a batch to complete.
 * Polls with exponential backoff starting at 30 seconds, doubling each time, capped at 30 minutes.
 * Throws a non-retryable error after 24 hours.
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
    intervalMs = Math.min(intervalMs * 2, BATCH_POLL_INTERVAL_MAX_MS);

    const status = await checkBatchStatusActivity({ workspaceId, batchId });
    if (status === "ready") {
      return;
    }
  }

  throw new ApplicationFailure(
    `Batch ${batchId} in workspace ${workspaceId} timed out after 24 hours.`,
    "BATCH_TIMEOUT",
    true // non-retryable
  );
}

interface ReinforcedToolActionInfo {
  authType: AuthenticatorType;
  agentLoopArgs: AgentLoopArgsWithTiming;
  actionIds: ModelId[];
}

// Matches the return type of analyzeConversationStepActivity / aggregateSuggestionsForSkillStepActivity.
interface ReinforcedStepResult {
  isTerminal: boolean;
  suggestionsCreated: number;
  approvedSourceSuggestionIds: string[];
  reinforcementConversationId?: string;
  toolActionInfo?: ReinforcedToolActionInfo;
}

/**
 * Execute tool actions from a reinforced step result.
 * Wraps each tool execution in try/catch -- if it fails after all retries,
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
      // The AgentMCPActionResource exists but has no output -- the rendering
      // pipeline will inject a placeholder error for the LLM to see.
    }
  }
}

/**
 * Shared multi-step streaming loop for reinforced skills operations.
 * Calls the step activity, executes exploratory tools, and loops until terminal.
 *
 * Tool results are stored in the reinforcement conversation by runRetryableToolActivity.
 * On the next step, the step activity renders the full conversation from DB via
 * renderConversationForModel -- no need to pass continuation messages explicitly.
 */
async function runMultiStepStreamingLoop(
  stepFn: (
    reinforcementConversationId: string | undefined
  ) => Promise<ReinforcedStepResult>
): Promise<{
  suggestionsCreated: number;
  approvedSourceSuggestionIds: string[];
}> {
  let reinforcementConversationId: string | undefined;
  let totalSuggestionsCreated = 0;
  const allApprovedSourceSuggestionIds: string[] = [];

  for (let step = 0; step < MAX_REINFORCED_ANALYSIS_STEPS; step++) {
    const result = await stepFn(reinforcementConversationId);

    reinforcementConversationId = result.reinforcementConversationId;
    totalSuggestionsCreated += result.suggestionsCreated;
    allApprovedSourceSuggestionIds.push(...result.approvedSourceSuggestionIds);

    if (result.isTerminal) {
      break;
    }

    if (result.toolActionInfo) {
      await executeReinforcedToolActions(result.toolActionInfo);
    }
  }

  return {
    suggestionsCreated: totalSuggestionsCreated,
    approvedSourceSuggestionIds: allApprovedSourceSuggestionIds,
  };
}

/**
 * Multi-step batch aggregation for a single skill.
 */
async function aggregateSkillWithMultiStepBatch({
  workspaceId,
  skillId,
  disableNotifications,
}: {
  workspaceId: string;
  skillId: string;
  disableNotifications: boolean;
}): Promise<void> {
  let reinforcementConversationId: string | undefined;
  let totalSuggestionsCreated = 0;
  const allApprovedSourceSuggestionIds: string[] = [];

  for (let step = 0; step < MAX_REINFORCED_ANALYSIS_STEPS; step++) {
    const batchResult = await startSkillAggregationBatchActivity({
      workspaceId,
      skillId,
      existingReinforcementConversationId: reinforcementConversationId,
    });

    if (!batchResult) {
      break;
    }

    await waitForBatch({ workspaceId, batchId: batchResult.batchId });

    const result = await processSkillAggregationBatchResultActivity({
      workspaceId,
      skillId,
      batchId: batchResult.batchId,
      reinforcementConversationIds: batchResult.reinforcementConversationIds,
    });

    totalSuggestionsCreated += result.suggestionsCreated;
    allApprovedSourceSuggestionIds.push(...result.approvedSourceSuggestionIds);

    if (!result.needsContinuation) {
      break;
    }

    reinforcementConversationId = result.reinforcementConversationId;

    if (result.toolActionInfo) {
      await executeReinforcedToolActions(result.toolActionInfo);
    }
  }

  await finalizeSkillAggregationActivity({
    workspaceId,
    skillId,
    suggestionsCreated: totalSuggestionsCreated,
    approvedSourceSuggestionIds: allApprovedSourceSuggestionIds,
    disableNotifications,
  });
}

/**
 * Cron workflow that ensures all flagged workspaces have a running
 * reinforcement schedule and stops schedules for workspaces that lost the flag.
 */
export async function ensureReinforcementWorkspaceSchedulesWorkflow(): Promise<void> {
  await ensureReinforcementWorkspaceSchedulesActivity();
}

/**
 * Workspace-level workflow (one per workspace, schedule-triggered).
 * The Temporal schedule applies a 2-hour jitter to spread load.
 *
 * Flow:
 * 1. Check allowed
 * 2. Discover conversations with skills
 * 3. Analyze conversations concurrently via multi-step loop
 * 4. Find skills with synthetic suggestions
 * 5. Aggregate per-skill concurrently via multi-step loop
 * 6. Finalize per skill
 */
export async function reinforcementWorkspaceWorkflow({
  workspaceId,
  useBatchMode,
  skillId,
  conversationLookbackDays,
  disableNotifications = false,
}: {
  workspaceId: string;
  useBatchMode: boolean;
  skillId?: string;
  conversationLookbackDays?: number;
  disableNotifications?: boolean;
}): Promise<void> {
  const { reinforcementEnabled, batchModeAllowed } =
    await getReinforcementSettingsActivity({ workspaceId });
  if (!reinforcementEnabled) {
    return;
  }

  // Resolve effective batch mode: the caller may request batch mode, but the
  // workspace setting can override it to streaming.
  const effectiveBatchMode = useBatchMode && batchModeAllowed;

  // Phase 1: Discover conversations with skills.
  const conversationsWithSkills =
    await getRecentConversationsWithSkillsActivity({
      workspaceId,
      lookbackDays: conversationLookbackDays,
      skillId,
    });

  if (conversationsWithSkills.length === 0) {
    return;
  }

  if (effectiveBatchMode) {
    // Phase 2: Batch-analyze conversations with multi-step loop.
    let pendingConversations = conversationsWithSkills;
    let reinforcementConversationMap: Record<string, string> | undefined;
    let step = 0;

    while (
      step < MAX_REINFORCED_ANALYSIS_STEPS &&
      pendingConversations.length > 0
    ) {
      const batchResult = await startSkillConversationAnalysisBatchActivity({
        workspaceId,
        conversationsWithSkills: pendingConversations,
        existingReinforcementConversationMap: reinforcementConversationMap,
      });

      if (!batchResult) {
        break;
      }

      await waitForBatch({ workspaceId, batchId: batchResult.batchId });

      reinforcementConversationMap = batchResult.reinforcementConversationMap;

      const continuations =
        await processSkillConversationAnalysisBatchResultActivity({
          workspaceId,
          batchId: batchResult.batchId,
          reinforcementConversationMap,
        });

      if (continuations.length === 0) {
        break;
      }

      // Execute exploratory tools via the agent loop's retryable tool activity.
      for (const c of continuations) {
        if (c.toolActionInfo) {
          await executeReinforcedToolActions(c.toolActionInfo);
        }
      }

      // Next iteration will re-submit only the continuing conversations.
      const continuingIds = new Set(
        continuations.map((c) => c.analysedConversationId)
      );
      pendingConversations = pendingConversations.filter((c) =>
        continuingIds.has(c.conversationId)
      );
      step++;
    }

    // Phase 3: Find skills with synthetic suggestions.
    const skillIdsWithSuggestions =
      await getSkillsWithSyntheticSuggestionsActivity({
        workspaceId,
        skillId,
      });

    if (skillIdsWithSuggestions.length === 0) {
      return;
    }

    // Phase 4-5: Per-skill batch aggregation + finalize.
    await concurrentExecutor(
      skillIdsWithSuggestions,
      (currentSkillId) =>
        aggregateSkillWithMultiStepBatch({
          workspaceId,
          skillId: currentSkillId,
          disableNotifications,
        }),
      { concurrency: SKILL_AGGREGATION_CONCURRENCY }
    );
  } else {
    // Phase 2: Analyze conversations concurrently via streaming multi-step.
    await concurrentExecutor(
      conversationsWithSkills,
      ({ conversationId, skillIds }) =>
        runMultiStepStreamingLoop((reinforcementConversationId) =>
          analyzeConversationStepActivity({
            workspaceId,
            conversationId,
            skillIds,
            reinforcementConversationId,
          })
        ),
      { concurrency: CONVERSATION_ANALYSIS_CONCURRENCY }
    );

    // Phase 3: Find skills with synthetic suggestions.
    const skillIdsWithSuggestions =
      await getSkillsWithSyntheticSuggestionsActivity({
        workspaceId,
        skillId,
      });

    if (skillIdsWithSuggestions.length === 0) {
      return;
    }

    // Phase 4: Aggregate per-skill concurrently.
    const aggregationResults = await concurrentExecutor(
      skillIdsWithSuggestions,
      async (currentSkillId) => {
        const { suggestionsCreated, approvedSourceSuggestionIds } =
          await runMultiStepStreamingLoop((reinforcementConversationId) =>
            aggregateSuggestionsForSkillStepActivity({
              workspaceId,
              skillId: currentSkillId,
              reinforcementConversationId,
            })
          );
        return {
          skillId: currentSkillId,
          suggestionsCreated,
          approvedSourceSuggestionIds,
        };
      },
      { concurrency: SKILL_AGGREGATION_CONCURRENCY }
    );

    // Phase 5: Finalize per skill.
    for (const {
      skillId: currentSkillId,
      suggestionsCreated,
      approvedSourceSuggestionIds,
    } of aggregationResults) {
      await finalizeSkillAggregationActivity({
        workspaceId,
        skillId: currentSkillId,
        suggestionsCreated,
        approvedSourceSuggestionIds,
        disableNotifications,
      });
    }
  }
}
