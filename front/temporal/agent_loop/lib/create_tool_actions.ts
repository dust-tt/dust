import assert from "assert";

import type {
  MCPApproveExecutionEvent,
  MCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import { getAugmentedInputs } from "@app/lib/actions/mcp_execution";
import { validateToolInputs } from "@app/lib/actions/mcp_utils";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import type { StepContext } from "@app/lib/actions/types";
import { getExecutionStatusFromConfig } from "@app/lib/actions/utils";
import type { MCPToolRetryPolicyType } from "@app/lib/api/mcp";
import { getRetryPolicyFromToolConfiguration } from "@app/lib/api/mcp";
import { createMCPAction } from "@app/lib/api/mcp/create_mcp";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMessage } from "@app/lib/models/assistant/conversation";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { updateResourceAndPublishEvent } from "@app/temporal/agent_loop/activities/common";
import type {
  AgentActionsEvent,
  AgentConfigurationType,
  AgentMessageType,
  ConversationWithoutContentType,
  ModelId,
} from "@app/types";
import type { RunAgentExecutionData } from "@app/types/assistant/agent_run";

export interface ActionBlob {
  actionId: ModelId;
  actionStatus: ToolExecutionStatus;
  needsApproval: boolean;
  retryPolicy: MCPToolRetryPolicyType;
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

  const actionBlobs: ActionBlob[] = [];
  const approvalEvents: Omit<
    MCPApproveExecutionEvent,
    "isLastBlockingEventForStep"
  >[] = [];

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
      conversation,
      stepContentId,
      stepContext: stepContexts[index],
      step,
    });

    if (result) {
      actionBlobs.push(result.actionBlob);
      if (result.approvalEventData) {
        approvalEvents.push(result.approvalEventData);
      }
    }
  }

  // Publish all approval events with the isLastBlockingEventForStep flag
  for (const [idx, eventData] of approvalEvents.entries()) {
    const isLastApproval = idx === approvalEvents.length - 1;

    await updateResourceAndPublishEvent(auth, {
      event: {
        ...eventData,
        isLastBlockingEventForStep: isLastApproval,
      },
      agentMessageRow,
      conversation,
      step,
    });
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
    conversation,
    stepContentId,
    stepContext,
    step,
  }: {
    actionConfiguration: MCPToolConfigurationType;
    agentConfiguration: AgentConfigurationType;
    agentMessage: AgentMessageType;
    agentMessageRow: AgentMessage;
    conversation: ConversationWithoutContentType;
    stepContentId: ModelId;
    stepContext: StepContext;
    step: number;
  }
): Promise<{
  actionBlob: ActionBlob;
  approvalEventData?: Omit<
    MCPApproveExecutionEvent,
    "isLastBlockingEventForStep"
  >;
} | void> {
  const { status } = await getExecutionStatusFromConfig(
    auth,
    actionConfiguration,
    agentMessage
  );

  const stepContent =
    await AgentStepContentResource.fetchByModelId(stepContentId);
  assert(
    stepContent,
    `Step content not found for stepContentId: ${stepContentId}`
  );

  assert(
    stepContent.isFunctionCallContent(),
    `Expected step content to be a function call, got: ${stepContent.value.type}`
  );

  const rawInputs = JSON.parse(stepContent.value.value.arguments);

  const validateToolInputsResult = validateToolInputs(rawInputs);
  if (validateToolInputsResult.isErr()) {
    return updateResourceAndPublishEvent(auth, {
      event: {
        type: "tool_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        conversationId: conversation.sId,
        error: {
          code: "tool_error",
          message: validateToolInputsResult.error.message,
          metadata: null,
        },
        // This is not exactly correct, but it's not relevant here as we only care about the
        // blocking nature of the event, which is not the case here.
        isLastBlockingEventForStep: false,
      },
      agentMessageRow,
      conversation,
      step,
    });
  }

  // Compute augmented inputs with preconfigured data sources, etc.
  const augmentedInputs = getAugmentedInputs(auth, {
    actionConfiguration,
    rawInputs,
  });

  // Create the action object in the database and yield an event for the generation of the params.
  // We store the action here as the params have been generated, if an error occurs later on,
  // the error will be stored on the parent agent message.
  const action = await createMCPAction(auth, {
    agentMessage,
    status,
    actionConfiguration,
    augmentedInputs,
    stepContentId,
    stepContext,
  });

  // Publish the tool params event.
  await updateResourceAndPublishEvent(auth, {
    event: {
      type: "tool_params",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      // TODO: cleanup the type field from the public API users and remove everywhere.
      // TODO: move the output field to a separate field.
      action: { ...action.toJSON(), output: null, generatedFiles: [] },
    },
    agentMessageRow,
    conversation,
    step,
  });

  return {
    actionBlob: {
      actionId: action.id,
      actionStatus: status,
      needsApproval: status === "blocked_validation_required",
      retryPolicy: getRetryPolicyFromToolConfiguration(actionConfiguration),
    },
    approvalEventData:
      status === "blocked_validation_required"
        ? {
            type: "tool_approve_execution",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            conversationId: conversation.sId,
            actionId: action.sId,
            inputs: action.augmentedInputs,
            stake: actionConfiguration.permission,
            metadata: {
              toolName: actionConfiguration.originalName,
              mcpServerName: actionConfiguration.mcpServerName,
              agentName: agentConfiguration.name,
              icon: actionConfiguration.icon,
            },
          }
        : undefined,
  };
}
