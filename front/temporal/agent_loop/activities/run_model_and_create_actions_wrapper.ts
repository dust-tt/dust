import assert from "assert";

import type { AuthenticatorType } from "@app/lib/auth";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMCPAction } from "@app/lib/models/assistant/actions/mcp";
import { AgentMCPAction as AgentMCPActionModel } from "@app/lib/models/assistant/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/assistant/agent_step_content";
import logger from "@app/logger/logger";
import { createToolActionsActivity } from "@app/temporal/agent_loop/activities/create_tool_actions";
import { runModelActivity } from "@app/temporal/agent_loop/activities/run_model";
import type { ModelId } from "@app/types";
import { MAX_ACTIONS_PER_STEP } from "@app/types/assistant/agent";
import { isFunctionCallContent } from "@app/types/assistant/agent_message_content";
import type {
  RunAgentArgs,
  RunAgentSynchronousArgs,
} from "@app/types/assistant/agent_run";
import { getRunAgentData } from "@app/types/assistant/agent_run";

interface ActionBlob {
  action: AgentMCPAction;
  needsApproval: boolean;
}

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
  runAgentArgs,
  runIds,
  step,
  autoRetryCount = 0,
}: {
  authType: AuthenticatorType;
  runAgentArgs: RunAgentArgs;
  runIds: string[];
  step: number;
  autoRetryCount?: number;
  // TODO(DURABLE_AGENTS 2025-08-12): Add a flag to indicate that we can skip the action check.
}): Promise<RunModelAndCreateActionsResult | null> {
  const runAgentDataRes = await getRunAgentData(authType, runAgentArgs);
  if (runAgentDataRes.isErr()) {
    return null;
  }

  const { auth, ...runAgentData } = runAgentDataRes.value;

  // Check if actions already exist for this step. If so, we are resuming from tool validation.
  const existingData = await getExistingActionsAndBlobs(
    auth,
    runAgentData,
    step
  );

  if (existingData) {
    const localLogger = logger.child({ step });
    localLogger.info("Resuming from tool validation - using existing actions");

    return {
      actionBlobs: existingData.actionBlobs,
      runId: null,
    };
  }

  // Otherwise, run both activities.
  const localLogger = logger.child({ step });
  localLogger.info("Running model and creating actions - normal path");

  // Track step content IDs by function call ID for later use in actions.
  const functionCallStepContentIds: Record<string, ModelId> = {};

  // 1. Run model activity.
  const modelResult = await runModelActivity(auth, {
    runAgentData,
    runIds,
    step,
    functionCallStepContentIds,
    autoRetryCount,
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

  // We received the actions to run, but will enforce a limit on the number of actions
  // which is very high. Over that the latency will just be too high. This is a guardrail
  // against the model outputting something unreasonable.
  const actionsToRun = actions.slice(0, MAX_ACTIONS_PER_STEP);

  // 2. Create tool actions.
  const createResult = await createToolActionsActivity(auth, {
    runAgentData,
    actions: actionsToRun,
    stepContexts,
    functionCallStepContentIds: updatedFunctionCallStepContentIds,
    step,
  });

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
  runAgentArgs: RunAgentSynchronousArgs,
  step: number
): Promise<{
  actionBlobs: ActionBlob[];
} | null> {
  // TODO(DURABLE_AGENTS 2025-08-12): Create a proper resource for the agent step content.
  const { agentMessage } = runAgentArgs;

  // Find function_call step contents for this step.
  const stepContents = await AgentStepContentModel.findAll({
    where: {
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
        isFunctionCallContent(stepContent.value),
        "Unexpected: step content is not a function call"
      );

      actionBlobs.push({
        action: mcpAction,
        needsApproval: mcpAction.executionState === "pending",
      });
    }
  }

  return { actionBlobs };
}
