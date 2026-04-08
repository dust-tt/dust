import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/reinforced_skills/activities";
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
import { concurrentExecutor } from "../utils";

// Export an interceptors variable to add OpenTelemetry interceptors to the workflow.
export const interceptors: WorkflowInterceptorsFactory = () => ({
  inbound: [new OpenTelemetryInboundInterceptor()],
  outbound: [new OpenTelemetryOutboundInterceptor()],
  internals: [new OpenTelemetryInternalsInterceptor()],
});

const { isSkillReinforcementAllowedActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
});

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

const BATCH_POLL_INTERVAL_MIN_MS = 30_000; // 30 seconds (linear backoff start).
const BATCH_POLL_INTERVAL_MAX_MS = 5 * 60_000; // 5 minutes (linear backoff cap).
const BATCH_POLL_INTERVAL_STEP_MS = 10_000; // 10 seconds (linear backoff step).
const BATCH_TIMEOUT_MS = 6 * 60 * 60_000; // 6 hours.

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/**
 * Compute a deterministic delay (0 to 2 hours) from a workspace ID string.
 * This spreads cron-triggered executions across the midnight-2am window
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

interface ReinforcedToolActionInfo {
  authType: AuthenticatorType;
  agentLoopArgs: AgentLoopArgsWithTiming;
  actionIds: ModelId[];
}

// Matches the return type of analyzeConversationStepActivity / aggregateSuggestionsForSkillStepActivity.
interface ReinforcedStepResult {
  isTerminal: boolean;
  suggestionsCreated: number;
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
 * Workspace-level workflow (one per workspace, cron-scheduled).
 * When `skipDelay` is false (cron runs), sleeps a deterministic delay derived
 * from the workspace ID to spread load across the midnight-2am window.
 * When `skipDelay` is true (manual runs), starts immediately.
 *
 * Flow:
 * 1. Check allowed
 * 2. Optional delay (cron spreading)
 * 3. Discover conversations with skills
 * 4. Analyze conversations concurrently via multi-step loop
 * 5. Find skills with synthetic suggestions
 * 6. Aggregate per-skill concurrently via multi-step loop
 * 7. Finalize per skill
 */
export async function reinforcedSkillsWorkspaceWorkflow({
  workspaceId,
  useBatchMode,
  skipDelay = false,
  skillId,
  conversationLookbackDays,
  disableNotifications = false,
}: {
  workspaceId: string;
  useBatchMode: boolean;
  skipDelay?: boolean;
  skillId?: string;
  conversationLookbackDays?: number;
  disableNotifications?: boolean;
}): Promise<void> {
  const isAllowed = await isSkillReinforcementAllowedActivity({ workspaceId });
  if (!isAllowed) {
    return;
  }

  if (!skipDelay) {
    const delayMs = computeWorkspaceDelayMs(workspaceId);
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

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

  // Phase 2: Analyze conversations concurrently via streaming multi-step.
  await concurrentExecutor(
    conversationsWithSkills,
    ({ conversationSId, skillSIds }) =>
      runMultiStepStreamingLoop((reinforcementConversationId) =>
        analyzeConversationStepActivity({
          workspaceId,
          conversationId: conversationSId,
          skillSIds,
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
      const { suggestionsCreated } = await runMultiStepStreamingLoop(
        (reinforcementConversationId) =>
          aggregateSuggestionsForSkillStepActivity({
            workspaceId,
            skillId: currentSkillId,
            reinforcementConversationId,
          })
      );
      return { skillId: currentSkillId, suggestionsCreated };
    },
    { concurrency: SKILL_AGGREGATION_CONCURRENCY }
  );

  // Phase 5: Finalize per skill.
  for (const { skillId: currentSkillId, suggestionsCreated } of aggregationResults) {
    await finalizeSkillAggregationActivity({
      workspaceId,
      skillId: currentSkillId,
      suggestionsCreated,
      disableNotifications,
    });
  }
}
