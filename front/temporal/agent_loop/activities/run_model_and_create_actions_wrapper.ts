import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
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
import { updateResourceAndPublishEvent } from "@app/temporal/agent_loop/activities/common";
import { METRICS } from "@app/temporal/agent_loop/activities/instrumentation";
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
import type { ModelId } from "@app/types/shared/model_id";
import { startActiveObservation } from "@langfuse/tracing";
import { Context, heartbeat } from "@temporalio/activity";

export type RunModelAndCreateActionsResult = {
  actionBlobs: ActionBlob[];
  runId: string | null;
  // The model returned nothing at all: the loop should run one more step with
  // tool use disabled to force a final answer.
  retryWithoutTools?: boolean;
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
  runAgentArgs,
  runIds,
  step,
  forceDisableToolUse = false,
}: {
  authType: AuthenticatorType;
  checkForResume?: boolean;
  runAgentArgs: AgentLoopArgsWithTiming;
  runIds: string[];
  step: number;
  forceDisableToolUse?: boolean;
}): Promise<RunModelAndCreateActionsResult | null> {
  // The pre-stream setup (agent data loading, MCP tools listing, conversation rendering) can
  // stall past the heartbeat timeout, e.g. on a hung MCP server's tools/list call: heartbeat
  // immediately and periodically for the whole activity. The LLM stream adds its own heartbeats.
  heartbeat();

  return withPeriodicHeartbeat(
    () =>
      tracer.trace("runModelAndCreateActionsActivity", async () =>
        _runModelAndCreateActionsActivity({
          authType,
          checkForResume,
          runAgentArgs,
          runIds,
          step,
          forceDisableToolUse,
        })
      ),
    {
      intervalMs: MODEL_ACTIVITY_HEARTBEAT_INTERVAL_MS,
      heartbeatFn: () => heartbeat(),
    }
  );
}

async function _runModelAndCreateActionsActivity({
  authType,
  checkForResume,
  runAgentArgs,
  runIds,
  step,
  forceDisableToolUse,
}: {
  authType: AuthenticatorType;
  checkForResume: boolean;
  runAgentArgs: AgentLoopArgsWithTiming;
  runIds: string[];
  step: number;
  forceDisableToolUse: boolean;
}): Promise<RunModelAndCreateActionsResult | null> {
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
      logger.info(
        {
          conversationId: runAgentArgs.conversationId,
          agentMessageId: runAgentArgs.agentMessageId,
        },
        "Message or conversation was deleted, exiting"
      );
      return null;
    }
    throw contextProviderRes.error;
  }
  durationRecorder.record(METRICS.TIME_TO_DATA_LOADED);

  const contextProvider = contextProviderRes.value;
  const runAgentData = contextProvider.runtimeData;
  const isRootAgentMessage = !runAgentData.userMessage.agenticMessageData;

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

    return null;
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

    return null;
  }

  // Tool test run: bypass LLM and directly execute tool commands.
  if (featureFlags.includes("run_tools_from_prompt")) {
    const result = await handlePromptCommand(auth, runAgentData, step, runIds);
    if (result !== "not_a_command") {
      return result;
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
      return {
        actionBlobs: existingData.actionBlobs,
        runId: null,
      };
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
    return null;
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
    return { runId, actionBlobs: [], retryWithoutTools };
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
  durationRecorder.record(METRICS.TIME_TO_ACTIONS_CREATED);

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

  return {
    runId,
    actionBlobs: createResult.actionBlobs,
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
