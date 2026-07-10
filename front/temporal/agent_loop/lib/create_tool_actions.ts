import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import { getAugmentedInputs } from "@app/lib/actions/mcp_execution";
import type { AgentLoopMCPApproveExecutionEvent } from "@app/lib/actions/mcp_internal_actions/events";
import { validateToolInputs } from "@app/lib/actions/mcp_utils";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { makeMCPApproveExecutionEventBase } from "@app/lib/actions/tool_approval_events";
import { getExecutionStatusFromConfig } from "@app/lib/actions/tool_status";
import type { StepContext } from "@app/lib/actions/types";
import {
  buildAuditLogTarget,
  emitAuditLogEventDirect,
} from "@app/lib/api/audit/workos_audit";
import type { MCPToolRetryPolicyType } from "@app/lib/api/mcp";
import { getRetryPolicyFromToolConfiguration } from "@app/lib/api/mcp";
import { createMCPAction } from "@app/lib/api/mcp/create_mcp";
import type { Authenticator } from "@app/lib/auth";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import logger from "@app/logger/logger";
import { updateResourceAndPublishEvent } from "@app/temporal/agent_loop/activities/common";
import type { AgentActionsEvent } from "@app/types/assistant/agent";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { ModelId } from "@app/types/shared/model_id";
import assert from "assert";

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
    runIds,
  }: {
    runAgentData: AgentLoopExecutionData;
    actions: AgentActionsEvent["actions"];
    stepContexts: StepContext[];
    functionCallStepContentIds: Record<string, ModelId>;
    step: number;
    runIds: string[];
  }
): Promise<CreateToolActionsResult> {
  const { agentConfiguration, model, agentMessage, conversation } =
    runAgentData;

  const actionBlobs: ActionBlob[] = [];
  const approvalEvents: Omit<
    AgentLoopMCPApproveExecutionEvent,
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
      model,
      agentMessage,
      conversation,
      stepContentId,
      stepContext: stepContexts[index],
      step,
      runIds,
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
      agentMessage,
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
    model,
    agentMessage,
    conversation,
    stepContentId,
    stepContext,
    step,
    runIds,
  }: {
    actionConfiguration: MCPToolConfigurationType;
    agentConfiguration: AgentLoopExecutionData["agentConfiguration"];
    model: ModelConfigurationType;
    agentMessage: AgentLoopExecutionData["agentMessage"];
    conversation: ConversationWithoutContentType;
    stepContentId: ModelId;
    stepContext: StepContext;
    step: number;
    runIds: string[];
  }
): Promise<{
  actionBlob: ActionBlob;
  approvalEventData?: Omit<
    AgentLoopMCPApproveExecutionEvent,
    "isLastBlockingEventForStep"
  >;
} | void> {
  // First, get the step content and parse inputs - we need this for medium stake checks
  const stepContent = await AgentStepContentResource.fetchByModelIdWithAuth(
    auth,
    stepContentId
  );
  assert(
    stepContent,
    `Step content not found for stepContentId: ${stepContentId}`
  );

  assert(
    stepContent.isFunctionCallContent(),
    `Expected step content to be a function call, got: ${stepContent.value.type}`
  );

  const rawInputs = JSON.parse(stepContent.value.value.arguments);
  const { status } = await getExecutionStatusFromConfig(auth, {
    actionConfiguration,
    skipToolsValidation: agentMessage.skipToolsValidation,
    context: {
      agentId: agentConfiguration.sId,
      toolInputs: rawInputs,
    },
  });

  const validateToolInputsResult = validateToolInputs(rawInputs);
  if (validateToolInputsResult.isErr()) {
    logger.error(
      {
        conversationId: conversation.sId,
        agentMessageId: agentMessage.sId,
        stepContentId,
        modelId: model.modelId,
        providerId: model.providerId,
        error: validateToolInputsResult.error,
      },
      "Tool input validation failed"
    );
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
      agentMessage,
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
    actionConfiguration,
    agentMessage,
    augmentedInputs,
    conversation,
    status,
    stepContent,
    stepContext,
  });

  // The action was persisted as blocked pending human approval — emit an audit
  // event so the approval request is traceable. Worker context, so emit direct
  // with the agent as actor (mirrors tool.executed).
  if (status === "blocked_validation_required") {
    const workspace = auth.getNonNullableWorkspace();
    void emitAuditLogEventDirect({
      workspace,
      action: "tool.approval_requested",
      actor: {
        type: "agent",
        id: agentConfiguration.sId,
        name: agentConfiguration.name,
      },
      targets: [
        buildAuditLogTarget("workspace", workspace),
        buildAuditLogTarget("agent", agentConfiguration),
        buildAuditLogTarget("tool", {
          sId: actionConfiguration.name,
          name: actionConfiguration.originalName,
        }),
      ],
      context: { location: auth.clientIp() ?? "internal" },
      metadata: {
        tool_name: actionConfiguration.originalName,
        mcp_server_name: actionConfiguration.mcpServerName,
        stake_level: actionConfiguration.permission,
        conversation_id: conversation.sId,
        agent_message_id: agentMessage.sId,
        action_id: action.sId,
        initiating_user_id: auth.user()?.sId ?? "unknown",
        initiating_user_email: auth.user()?.email ?? "unknown",
      },
    });
  }

  // Publish the tool params event with runIds so they're saved when workflow exits early.
  await updateResourceAndPublishEvent(auth, {
    event: {
      type: "tool_params",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: { ...action.toJSON(), output: null, generatedFiles: [] },
      runIds,
    },
    agentMessage,
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
            ...(await makeMCPApproveExecutionEventBase(auth, {
              actionId: action.sId,
              toolConfiguration: actionConfiguration,
              inputs: action.augmentedInputs,
              approvalLabelInputs: rawInputs,
              approvalSubjectName: agentConfiguration.name,
            })),
            configurationId: agentConfiguration.sId,
            conversationId: conversation.sId,
            messageId: agentMessage.sId,
          }
        : undefined,
  };
}
