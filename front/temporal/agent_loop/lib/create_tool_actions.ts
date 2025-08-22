import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import { createMCPAction } from "@app/lib/actions/mcp";
import { getAugmentedInputs } from "@app/lib/actions/mcp_execution";
import { validateToolInputs } from "@app/lib/actions/mcp_utils";
import type { StepContext } from "@app/lib/actions/types";
import {
  approvalStatusToToolExecutionStatus,
  getExecutionStatusFromConfig,
} from "@app/lib/actions/utils";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMessage } from "@app/lib/models/assistant/conversation";
import { updateResourceAndPublishEvent } from "@app/temporal/agent_loop/activities/common";
import { buildActionBaseParams } from "@app/temporal/agent_loop/lib/action_utils";
import type {
  AgentActionsEvent,
  AgentConfigurationType,
  AgentMessageType,
  ModelId,
} from "@app/types";
import type { RunAgentExecutionData } from "@app/types/assistant/agent_run";

export interface ActionBlob {
  actionId: ModelId;
  needsApproval: boolean;
}

type CreateToolActionsResult = {
  actionBlobs: ActionBlob[];
};

export async function createToolActionsActivity(
  auth: Authenticator,
  {
    runAgentData,
    actions,
    stepContexts,
    functionCallStepContentIds,
    step,
  }: {
    runAgentData: RunAgentExecutionData;
    actions: AgentActionsEvent["actions"];
    stepContexts: StepContext[];
    functionCallStepContentIds: Record<string, ModelId>;
    step: number;
  }
): Promise<CreateToolActionsResult> {
  const { agentConfiguration, agentMessage, agentMessageRow, conversation } =
    runAgentData;
  const conversationId = conversation.sId;

  const actionBlobs: ActionBlob[] = [];

  for (const [
    index,
    { action: actionConfiguration, functionCallId },
  ] of actions.entries()) {
    const stepContentId = functionCallStepContentIds[functionCallId];

    const result = await createActionForTool(auth, {
      actionConfiguration,
      agentConfiguration,
      agentMessage,
      agentMessageRow,
      conversationId,
      stepContentId,
      stepContext: stepContexts[index],
      step,
    });

    if (result) {
      actionBlobs.push(result);
    }
  }

  return {
    actionBlobs,
  };
}

async function createActionForTool(
  auth: Authenticator,
  {
    actionConfiguration,
    agentConfiguration,
    agentMessage,
    agentMessageRow,
    conversationId,
    stepContentId,
    stepContext,
    step,
  }: {
    actionConfiguration: MCPToolConfigurationType;
    agentConfiguration: AgentConfigurationType;
    agentMessage: AgentMessageType;
    agentMessageRow: AgentMessage;
    conversationId: string;
    stepContentId: ModelId;
    stepContext: StepContext;
    step: number;
  }
): Promise<ActionBlob | void> {
  const { status } = await getExecutionStatusFromConfig(
    auth,
    actionConfiguration,
    agentMessage
  );

  const actionBaseParams = await buildActionBaseParams({
    agentMessageId: agentMessage.agentMessageId,
    citationsAllocated: stepContext.citationsCount,
    mcpServerId: actionConfiguration.toolServerId,
    mcpServerConfigurationId: actionConfiguration.id.toString(),
    step,
    stepContentId,
    status: approvalStatusToToolExecutionStatus(status),
  });

  const validateToolInputsResult = validateToolInputs(actionBaseParams.params);
  if (validateToolInputsResult.isErr()) {
    return updateResourceAndPublishEvent(
      {
        type: "tool_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "tool_error",
          message: validateToolInputsResult.error.message,
          metadata: null,
        },
      },
      agentMessageRow,
      {
        conversationId,
        step,
      }
    );
  }

  // Compute augmented inputs with preconfigured data sources, etc.
  const augmentedInputs = getAugmentedInputs(auth, {
    actionConfiguration,
    rawInputs: actionBaseParams.params,
  });

  // Create the action object in the database and yield an event for the generation of the params.
  // We store the action here as the params have been generated, if an error occurs later on,
  // the error will be stored on the parent agent message.
  const { action: agentMCPAction, mcpAction } = await createMCPAction(auth, {
    actionBaseParams,
    actionConfiguration,
    augmentedInputs,
    stepContentId,
    stepContext,
    approvalStatus: status,
  });

  // Publish the tool params event.
  await updateResourceAndPublishEvent(
    {
      type: "tool_params",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: mcpAction,
    },
    agentMessageRow,
    {
      conversationId,
      step,
    }
  );

  if (status === "pending") {
    await updateResourceAndPublishEvent(
      {
        type: "tool_approve_execution",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        conversationId,
        actionId: mcpAction.getSId(auth.getNonNullableWorkspace()),
        inputs: mcpAction.params,
        stake: actionConfiguration.permission,
        metadata: {
          toolName: actionConfiguration.originalName,
          mcpServerName: actionConfiguration.mcpServerName,
          agentName: agentConfiguration.name,
          icon: actionConfiguration.icon,
        },
      },
      agentMessageRow,
      {
        conversationId,
        step,
      }
    );
  }

  // Update the action to surface the execution state.
  await agentMCPAction.update({
    executionState: status,
  });

  return {
    actionId: agentMCPAction.id,
    needsApproval: status === "pending",
  };
}
