import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import {
  getCreditSpendCheckpointConfig,
  hasCrossedCreditSpendCheckpoint,
  hasReachedCreditSpendCheckpoint,
  isExemptFromCreditSpendCheckpoint,
} from "@app/lib/api/assistant/credit_spend_checkpoint";
import { getRetryPolicyFromToolConfiguration } from "@app/lib/api/mcp";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import { DurationRecorder } from "@app/lib/duration_recorder";
import { AgentStepContentToolExecutionModel } from "@app/lib/models/agent/actions/agent_step_content_tool_execution";
import { AgentMCPActionModel } from "@app/lib/models/agent/actions/mcp";
import { notifyManualActionRequired } from "@app/lib/notifications/workflows/manual-action-required";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { withPeriodicHeartbeat } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import tracer from "@app/logger/tracer";
import {
  finalizeUnavailableAgentLoop,
  updateResourceAndPublishEvent,
} from "@app/temporal/agent_loop/activities/common";
import { recordExecutionStarted } from "@app/temporal/agent_loop/activities/consumption";
import {
  AGENT_LOOP_COST_HARD_CAP_USD,
  AGENT_LOOP_SUBAGENT_HARD_CAP,
  checkCostAndSubagentsThresholds,
} from "@app/temporal/agent_loop/activities/cost_threshold_warnings";
import {
  MODEL_ACTIVITY_HEARTBEAT_INTERVAL_MS,
  RUN_MODEL_ACTIVITY_TIMEOUT_SAFETY_MARGIN_MS,
} from "@app/temporal/agent_loop/config";
import { prepareAgentLoopContextProvider } from "@app/temporal/agent_loop/lib/agent_loop_context_provider/checkpointed";
import type { ActionBlob } from "@app/temporal/agent_loop/lib/create_tool_actions";
import { createToolActionsActivity } from "@app/temporal/agent_loop/lib/create_tool_actions";
import { handlePromptCommand } from "@app/temporal/agent_loop/lib/prompt_commands";
import { runModel } from "@app/temporal/agent_loop/lib/run_model";
import { getMaxActionsPerStep } from "@app/types/assistant/agent";
import type {
  AgentLoopArgsWithTiming,
  AgentLoopRuntimeData,
} from "@app/types/assistant/agent_run";
import { isAgentLoopDataSoftDeleteError } from "@app/types/assistant/agent_run";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { startActiveObservation } from "@langfuse/tracing";
import { Context, heartbeat } from "@temporalio/activity";

export type RunModelAndCreateActionsResult = {
  actionBlobs: ActionBlob[];
  runId: string | null;
  // The model returned nothing at all: the loop should run one more step with
  // tool use disabled to force a final answer.
  retryWithoutTools?: boolean;
  creditSpendCheckpointCrossed?: boolean;
  // Only set on the step that first resolved it; see getCreditSpendCheckpointCrossed.
  creditSpendCheckpointConfig?: {
    enabled: boolean;
    thresholdAwuCredits: number;
  };
};

const AGENT_LOOP_COST_CAP_ERROR_CODE = "agent_loop_cost_cap_exceeded";
const AGENT_LOOP_SUBAGENT_CAP_ERROR_CODE = "agent_loop_subagent_cap_exceeded";
const AGENT_LOOP_RESOURCE_CAP_ERROR_MESSAGE =
  "This message used too many resources to continue. Start a new message with a narrower request.";

function getActivityTimeoutDeadlineMs(): number {
  const { startToCloseTimeoutMs } = Context.current().info;

  return (
    Date.now() +
    Math.max(
      0,
      startToCloseTimeoutMs - RUN_MODEL_ACTIVITY_TIMEOUT_SAFETY_MARGIN_MS
    )
  );
}

/**
 * Wrapper around runModel and createToolActionsActivity that:
 * 1. Checks if actions already exist for this step (resume case)
 * 2. If they exist, returns them without running expensive operations
 * 3. If they don't exist, runs both runModel and createToolActionsActivity
 */
export async function runModelAndCreateActionsActivity({
  authType,
  checkForResume = true,
  canInitializeConsumption,
  runAgentArgs,
  runIds,
  step,
  forceDisableToolUse = false,
  creditSpendCheckpointConfig,
}: {
  authType: AuthenticatorType;
  checkForResume?: boolean;
  // TODO(@id13): Remove this rollout guard once consumption is the only pipeline.
  canInitializeConsumption: boolean;
  runAgentArgs: AgentLoopArgsWithTiming;
  runIds: string[];
  step: number;
  forceDisableToolUse?: boolean;
  // Fetched once by the workflow before the step loop, when available (see workflows.ts).
  creditSpendCheckpointConfig?: {
    enabled: boolean;
    thresholdAwuCredits: number;
  };
}): Promise<RunModelAndCreateActionsResult | null> {
  // The pre-stream setup (agent data loading, MCP tools listing, conversation rendering) can
  // stall past the heartbeat timeout, e.g. on a hung MCP server's tools/list call: heartbeat
  // immediately and periodically for the whole activity. The LLM stream adds its own heartbeats.
  heartbeat();

  const result = await withPeriodicHeartbeat(
    () =>
      tracer.trace("runModelAndCreateActionsActivity", async () =>
        _runModelAndCreateActionsActivity({
          authType,
          checkForResume,
          canInitializeConsumption,
          runAgentArgs,
          runIds,
          step,
          forceDisableToolUse,
          creditSpendCheckpointConfig,
        })
      ),
    {
      intervalMs: MODEL_ACTIVITY_HEARTBEAT_INTERVAL_MS,
      heartbeatFn: () => heartbeat(),
    }
  );
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}

async function _runModelAndCreateActionsActivity({
  authType,
  checkForResume,
  canInitializeConsumption,
  runAgentArgs,
  runIds,
  step,
  forceDisableToolUse,
  creditSpendCheckpointConfig,
}: {
  authType: AuthenticatorType;
  checkForResume: boolean;
  // TODO(@id13): Remove this rollout guard once consumption is the only pipeline.
  canInitializeConsumption: boolean;
  runAgentArgs: AgentLoopArgsWithTiming;
  runIds: string[];
  step: number;
  forceDisableToolUse: boolean;
  creditSpendCheckpointConfig?: {
    enabled: boolean;
    thresholdAwuCredits: number;
  };
}): Promise<Result<RunModelAndCreateActionsResult | null, Error>> {
  const activityTimeoutDeadlineMs = getActivityTimeoutDeadlineMs();
  const durationRecorder = DurationRecorder.create([]);

  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);
  const featureFlags = await getFeatureFlags(auth);
  const contextProviderRes = await startActiveObservation(
    "get-agent-loop-data",
    () =>
      prepareAgentLoopContextProvider(auth, runAgentArgs, {
        featureFlags,
        isActivityRetry: Context.current().info.attempt > 1,
        step,
      })
  );
  if (contextProviderRes.isErr()) {
    if (isAgentLoopDataSoftDeleteError(contextProviderRes.error)) {
      await finalizeUnavailableAgentLoop(authType, runAgentArgs);
      logger.info(
        {
          conversationId: runAgentArgs.conversationId,
          agentMessageId: runAgentArgs.agentMessageId,
        },
        "Message or conversation was deleted, exiting"
      );
      return new Ok(null);
    }
    throw contextProviderRes.error;
  }

  const contextProvider = contextProviderRes.value;
  const runAgentData = contextProvider.runtimeData;
  const isRootAgentMessage = !runAgentData.userMessage.agenticMessageData;

  if (step === (runAgentArgs.startStep ?? 0)) {
    const result = await recordExecutionStarted(auth, runAgentArgs, {
      canInitializeConsumption,
    });
    if (result.isErr()) {
      return new Err(result.error);
    }
  }

  // Intentionally check at step start (not step end) to early exit if dollar amount too high.
  // This can miss thresholds crossed on the final step.
  // Not tied to checkForResume: we want this check on every step, not only phase entry.
  let hardCapCheckResult: {
    totalCostMicroUsd: number;
    hardCapExceeded: boolean;
    subagentLaunchCount: number;
    subagentHardCapExceeded: boolean;
  } | null = null;
  try {
    hardCapCheckResult = await checkCostAndSubagentsThresholds({
      auth,
      isRootAgentMessage,
      eventData: {
        agentMessageId: runAgentArgs.agentMessageId,
        conversationId: runAgentArgs.conversationId,
        step,
      },
    });
  } catch (error) {
    logger.warn(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        agentMessageId: runAgentArgs.agentMessageId,
        conversationId: runAgentArgs.conversationId,
        step,
        error,
      },
      "Failed to run guardrail checks"
    );
    // Fail closed: do not start the next step when we cannot evaluate cost.
    throw new Error("Failed to run guardrail checks");
  }

  if (hardCapCheckResult?.hardCapExceeded) {
    logger.warn(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        agentMessageId: runAgentArgs.agentMessageId,
        conversationId: runAgentArgs.conversationId,
        step,
        totalCostMicroUsd: hardCapCheckResult.totalCostMicroUsd,
      },
      "Agent loop hard cost cap exceeded before starting a new step"
    );

    await publishAgentLoopGuardrailExceededError(auth, {
      runAgentData,
      runIds,
      step,
      errorCode: AGENT_LOOP_COST_CAP_ERROR_CODE,
      errorMetadata: {
        category: "cost_cap",
        thresholdUsd: AGENT_LOOP_COST_HARD_CAP_USD,
        totalCostMicroUsd: hardCapCheckResult.totalCostMicroUsd,
      },
    });

    return new Ok(null);
  }

  if (hardCapCheckResult?.subagentHardCapExceeded) {
    logger.warn(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        agentMessageId: runAgentArgs.agentMessageId,
        conversationId: runAgentArgs.conversationId,
        step,
        subagentLaunchCount: hardCapCheckResult.subagentLaunchCount,
      },
      "Agent loop hard subagent cap exceeded before starting a new step"
    );

    await publishAgentLoopGuardrailExceededError(auth, {
      runAgentData,
      runIds,
      step,
      errorCode: AGENT_LOOP_SUBAGENT_CAP_ERROR_CODE,
      errorMetadata: {
        category: "subagent_cap",
        thresholdCount: AGENT_LOOP_SUBAGENT_HARD_CAP,
        subagentLaunchCount: hardCapCheckResult.subagentLaunchCount,
      },
    });

    return new Ok(null);
  }

  const checkpointResult = await getCreditSpendCheckpointCrossed(auth, {
    isRootAgentMessage,
    userMessageOrigin: runAgentArgs.userMessageOrigin ?? null,
    agentMessageId: runAgentArgs.agentMessageId,
    agentMessageModelId: runAgentData.agentMessage.agentMessageId,
    totalCostMicroUsd: hardCapCheckResult.totalCostMicroUsd,
    creditSpendCheckpointConfig,
  });
  // Spread into every return below instead of repeating both fields at each exit point.
  const checkpointFields = {
    creditSpendCheckpointCrossed: checkpointResult.crossed,
    creditSpendCheckpointConfig: checkpointResult.resolvedConfig,
  };

  // Tool test run: bypass LLM and directly execute tool commands. The command result does not
  // carry the checkpoint flag: a test run never pauses.
  if (featureFlags.includes("run_tools_from_prompt")) {
    const result = await handlePromptCommand(auth, runAgentData, step, runIds);
    if (result !== "not_a_command") {
      return new Ok(result);
    }
  }

  if (checkForResume) {
    // Check if actions already exist for this step. If so, we are resuming from tool validation.
    const existingData = await getExistingActionsAndBlobs(
      auth,
      runAgentData,
      step
    );

    if (existingData) {
      return new Ok({
        actionBlobs: existingData.actionBlobs,
        runId: null,
        ...checkpointFields,
      });
    }
  }

  // Otherwise, run the model and create actions.

  // Track step content IDs by function call ID for later use in actions.
  const functionCallStepContentIds: Record<string, ModelId> = {};

  // 1. Run model.
  const modelResult = await runModel(auth, {
    contextProvider,
    runIds,
    step,
    functionCallStepContentIds,
    durationRecorder,
    activityTimeoutDeadlineMs,
    forceDisableToolUse,
  });

  if (!modelResult) {
    return new Ok(null);
  }

  const {
    actions,
    functionCallStepContentIds: updatedFunctionCallStepContentIds,
    runId,
    stepContexts,
    retryWithoutTools,
  } = modelResult;

  // Generation completed (text response, no tool calls) — runModel returns
  // { actions: [], runId } so we still capture the runId for tracking.
  if (actions.length === 0) {
    return new Ok({
      runId,
      actionBlobs: [],
      retryWithoutTools,
      ...checkpointFields,
    });
  }

  // Enforce a limit on actions per step, reducing by depth (8/8/4/2)
  // to contain cascading fan-out from nested run_agent calls.
  const actionsToRun = actions.slice(
    0,
    getMaxActionsPerStep(runAgentData.conversation.depth)
  );

  // 2. Create tool actions.
  // Include the new runId in the runIds array when creating actions
  const currentRunIds = runId ? [...runIds, runId] : runIds;
  const createResult = await startActiveObservation("create-tool-actions", () =>
    createToolActionsActivity(auth, {
      runAgentData,
      actions: actionsToRun,
      stepContexts,
      functionCallStepContentIds: updatedFunctionCallStepContentIds,
      step,
      runIds: currentRunIds,
    })
  );

  const needsApproval = createResult.actionBlobs.some((a) => a.needsApproval);
  if (needsApproval) {
    await ConversationResource.markAsActionRequired(auth, {
      conversation: runAgentData.conversation,
    });

    if (!runAgentData.conversation.actionRequired) {
      notifyManualActionRequired(auth, {
        conversationId: runAgentData.conversation.sId,
      });
    }
  }

  return new Ok({
    runId,
    actionBlobs: createResult.actionBlobs,
    ...checkpointFields,
  });
}

/**
 * @cc [owner:avervaet,label:backend;performance] checkpoint-status-short-circuits-config
 * Once the agent message's persisted checkpoint status is non-NULL (`paused`, `acknowledged`, or
 * `stopped`), this MUST decide from that status alone and MUST NOT read the workspace's
 * checkpoint configuration (threshold or gate) again for that message. The configuration is only
 * ever read while the status is still unset, since the threshold itself is needed to know
 * whether the message has reached it in the first place.
 */
/**
 * Whether the agent loop must pause here for the user to confirm continuing. The agent message's
 * checkpoint status is read first and, once resolved, decides the answer on its own. While that
 * status is still unset, the passed-in `creditSpendCheckpointConfig` is used when the caller
 * already has one (captured from an earlier step in the same run); otherwise it's read here and
 * returned as `resolvedConfig` so the caller (the workflow, via the activity's result) can cache
 * it and skip this read on every later step of the run.
 */
export async function getCreditSpendCheckpointCrossed(
  auth: Authenticator,
  {
    isRootAgentMessage,
    userMessageOrigin,
    agentMessageId,
    agentMessageModelId,
    totalCostMicroUsd,
    creditSpendCheckpointConfig,
  }: {
    isRootAgentMessage: boolean;
    userMessageOrigin: UserMessageOrigin | null;
    agentMessageId: string;
    agentMessageModelId: ModelId;
    totalCostMicroUsd: number;
    // Captured by the workflow from an earlier step in the same run, when available.
    creditSpendCheckpointConfig?: {
      enabled: boolean;
      thresholdAwuCredits: number;
    };
  }
): Promise<{
  crossed: boolean;
  // Only set when this call read the config itself (none was passed in) — i.e. the first time
  // any step in the run needed it. The caller threads it forward for later steps to reuse.
  resolvedConfig?: { enabled: boolean; thresholdAwuCredits: number };
}> {
  const isExempt = isExemptFromCreditSpendCheckpoint(auth, {
    userMessageOrigin,
  });

  if (isExempt || !isRootAgentMessage) {
    return { crossed: false };
  }

  const status =
    await ConversationResource.fetchAgentMessageCreditSpendCheckpointStatus(
      auth,
      { agentMessageId }
    );

  if (status !== null) {
    return {
      crossed: hasCrossedCreditSpendCheckpoint({
        isExempt,
        isRootAgentMessage,
        status,
      }),
    };
  }

  // Status still unset: this message hasn't crossed the checkpoint yet, as far as we know. Use
  // the caller's cached config when we have it; otherwise read it and report it back so the
  // workflow can cache it. Once resolved below, later steps never take this path again.
  const config =
    creditSpendCheckpointConfig ?? (await getCreditSpendCheckpointConfig(auth));
  const resolvedConfig = creditSpendCheckpointConfig ? undefined : config;

  if (
    !hasReachedCreditSpendCheckpoint({
      totalCostMicroUsd,
      thresholdAwuCredits: config.thresholdAwuCredits,
    })
  ) {
    return { crossed: false, resolvedConfig };
  }

  if (!config.enabled) {
    await ConversationResource.transitionAgentMessageCreditSpendCheckpointStatus(
      auth,
      { agentMessageModelId, from: null, to: "acknowledged" }
    );
    return { crossed: false, resolvedConfig };
  }

  return {
    crossed: hasCrossedCreditSpendCheckpoint({
      isExempt,
      isRootAgentMessage,
      status,
    }),
    resolvedConfig,
  };
}

async function publishAgentLoopGuardrailExceededError(
  auth: Authenticator,
  {
    runAgentData,
    runIds,
    step,
    errorCode,
    errorMetadata,
  }: {
    runAgentData: AgentLoopRuntimeData;
    runIds: string[];
    step: number;
    errorCode: string;
    errorMetadata: Record<string, string | number | boolean>;
  }
): Promise<void> {
  await updateResourceAndPublishEvent(auth, {
    event: {
      type: "agent_error",
      created: Date.now(),
      configurationId: runAgentData.agentConfiguration.sId,
      messageId: runAgentData.agentMessage.sId,
      error: {
        code: errorCode,
        message: AGENT_LOOP_RESOURCE_CAP_ERROR_MESSAGE,
        metadata: errorMetadata,
      },
      runIds,
    },
    agentMessage: runAgentData.agentMessage,
    conversation: runAgentData.conversation,
    step,
  });
}

/**
 * Check if both actions and action blobs already exist for this step.
 * Returns combined data if they exist, null otherwise.
 */
async function getExistingActionsAndBlobs(
  auth: Authenticator,
  runAgentArgs: AgentLoopRuntimeData,
  step: number
): Promise<{
  actionBlobs: ActionBlob[];
} | null> {
  // TODO(DURABLE_AGENTS 2025-08-12): Create a proper resource for the agent step content.
  const { agentMessage } = runAgentArgs;

  const agentStepContentToolExecutions =
    await AgentStepContentToolExecutionModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentMessageId: agentMessage.agentMessageId,
      },
      include: [
        {
          model: AgentMCPActionModel,
          as: "agentMCPAction",
          required: true,
        },
      ],
    });

  if (agentStepContentToolExecutions.length === 0) {
    return null; // No existing actions.
  }

  const actionBlobs: ActionBlob[] = [];

  for (const toolExecution of agentStepContentToolExecutions) {
    const { agentMCPAction: mcpAction } = toolExecution;

    // If the tool is not already in a final state we must add it to the list of actions to run.
    if (!isToolExecutionStatusFinal(mcpAction.status)) {
      actionBlobs.push({
        actionId: mcpAction.id,
        actionStatus: mcpAction.status,
        needsApproval: mcpAction.status === "blocked_validation_required",
        retryPolicy: getRetryPolicyFromToolConfiguration(
          mcpAction.toolConfiguration
        ),
      });
    }
  }

  return { actionBlobs };
}
