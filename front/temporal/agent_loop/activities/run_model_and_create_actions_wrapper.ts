import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import { getRetryPolicyFromToolConfiguration } from "@app/lib/api/mcp";
import type { Authenticator, AuthenticatorType } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { AgentMCPActionModel } from "@app/lib/models/agent/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import type { ActionBlob } from "@app/temporal/agent_loop/lib/create_tool_actions";
import { createToolActionsActivity } from "@app/temporal/agent_loop/lib/create_tool_actions";
import { handlePromptCommand } from "@app/temporal/agent_loop/lib/prompt_commands";
import { runModelActivity } from "@app/temporal/agent_loop/lib/run_model";
import { getMaxActionsPerStep } from "@app/types/assistant/agent";
import { isAgentFunctionCallContent } from "@app/types/assistant/agent_message_content";
import type {
  AgentLoopArgsWithTiming,
  AgentLoopExecutionData,
} from "@app/types/assistant/agent_run";
import {
  getAgentLoopData,
  isAgentLoopDataSoftDeleteError,
} from "@app/types/assistant/agent_run";
import type { ModelId } from "@app/types/shared/model_id";
import assert from "assert";

export type RunModelAndCreateActionsResult = {
  actionBlobs: ActionBlob[];
  runId: string | null;
};

/**
 * Wrapper around runModelActivity and createToolActionsActivity that:
 * 1. Checks if actions already exist for this step (resume case)
 * 2. If they exist, returns them without running expensive operations
 * 3. If they don't exist, runs both runModelActivity and createToolActionsActivity
 */
export async function runModelAndCreateActionsActivity({
  authType,
  checkForResume = true,
  runAgentArgs,
  runIds,
  step,
}: {
  authType: AuthenticatorType;
  checkForResume?: boolean;
  runAgentArgs: AgentLoopArgsWithTiming;
  runIds: string[];
  step: number;
}): Promise<RunModelAndCreateActionsResult | null> {
  const runAgentDataRes = await getAgentLoopData(authType, runAgentArgs);
  if (runAgentDataRes.isErr()) {
    if (isAgentLoopDataSoftDeleteError(runAgentDataRes.error)) {
      logger.info(
        {
          conversationId: runAgentArgs.conversationId,
          agentMessageId: runAgentArgs.agentMessageId,
        },
        "Message or conversation was deleted, exiting"
      );
      return null;
    }
    throw runAgentDataRes.error;
  }

  const { auth, ...runAgentData } = runAgentDataRes.value;

  // Tool test run: bypass LLM and directly execute tool commands.
  const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
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

  // 1. Run model activity.
  const modelResult = await runModelActivity(auth, {
    runAgentData,
    runIds,
    step,
    functionCallStepContentIds,
  });

  if (!modelResult) {
    return null;
  }

  const {
    actions,
    functionCallStepContentIds: updatedFunctionCallStepContentIds,
    runId,
    stepContexts,
  } = modelResult;

  // Enforce a limit on actions per step, halving at each depth level (16/8/4/2)
  // to contain cascading fan-out from nested run_agent calls.
  const actionsToRun = actions.slice(
    0,
    getMaxActionsPerStep(runAgentData.conversation.depth)
  );

  // 2. Create tool actions.
  // Include the new runId in the runIds array when creating actions
  const currentRunIds = runId ? [...runIds, runId] : runIds;
  const createResult = await createToolActionsActivity(auth, {
    runAgentData,
    actions: actionsToRun,
    stepContexts,
    functionCallStepContentIds: updatedFunctionCallStepContentIds,
    step,
    runIds: currentRunIds,
  });

  const needsApproval = createResult.actionBlobs.some((a) => a.needsApproval);
  if (needsApproval) {
    await ConversationResource.markAsActionRequired(auth, {
      conversation: runAgentData.conversation,
    });
  }

  return {
    runId,
    actionBlobs: createResult.actionBlobs,
  };
}

/**
 * Check if both actions and action blobs already exist for this step.
 * Returns combined data if they exist, null otherwise.
 */
async function getExistingActionsAndBlobs(
  auth: Authenticator,
  runAgentArgs: AgentLoopExecutionData,
  step: number
): Promise<{
  actionBlobs: ActionBlob[];
} | null> {
  // TODO(DURABLE_AGENTS 2025-08-12): Create a proper resource for the agent step content.
  const { agentMessage } = runAgentArgs;

  // Find function_call step contents for this step.
  const stepContents = await AgentStepContentModel.findAll({
    where: {
      workspaceId: runAgentArgs.agentMessageRow.workspaceId,
      agentMessageId: agentMessage.agentMessageId,
      step,
      type: "function_call",
    },
    include: [
      {
        model: AgentMCPActionModel,
        as: "agentMCPActions",
        required: true,
      },
    ],
  });

  if (stepContents.length === 0) {
    return null; // No existing actions.
  }

  const actionBlobs: ActionBlob[] = [];

  for (const stepContent of stepContents) {
    if (stepContent.agentMCPActions && stepContent.agentMCPActions.length > 0) {
      const [mcpAction] = stepContent.agentMCPActions;

      assert(
        isAgentFunctionCallContent(stepContent.value),
        "Unexpected: step content is not a function call"
      );

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
  }

  return { actionBlobs };
}
