import assert from "assert";

import type {
  ActionBaseParams,
  MCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import { MCPActionType } from "@app/lib/actions/mcp";
import { runToolWithStreaming } from "@app/lib/actions/mcp";
import type { StepContext } from "@app/lib/actions/types";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPAction } from "@app/lib/models/assistant/actions/mcp";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { updateResourceAndPublishEvent } from "@app/temporal/agent_loop/activities/common";
import { sliceConversationForAgentMessage } from "@app/temporal/agent_loop/lib/loop_utils";
import type { ModelId } from "@app/types";
import { assertNever } from "@app/types";
import { isFunctionCallContent } from "@app/types/assistant/agent_message_content";
import type { RunAgentArgs } from "@app/types/assistant/agent_run";
import { getRunAgentData } from "@app/types/assistant/agent_run";

export async function runToolActivity(
  authType: AuthenticatorType,
  {
    actionId,
    actionConfiguration,
    rawMcpAction,
    runAgentArgs,
    step,
    stepContext,
  }: {
    actionId: ModelId;
    actionConfiguration: MCPToolConfigurationType;
    rawMcpAction: MCPActionType;
    runAgentArgs: RunAgentArgs;
    step: number;
    stepContext: StepContext;
  }
): Promise<void> {
  const auth = await Authenticator.fromJSON(authType);

  const runAgentDataRes = await getRunAgentData(authType, runAgentArgs);
  if (runAgentDataRes.isErr()) {
    throw runAgentDataRes.error;
  }

  const {
    agentConfiguration,
    conversation: originalConversation,
    agentMessage: originalAgentMessage,
    agentMessageRow,
  } = runAgentDataRes.value;

  const { slicedConversation: conversation, slicedAgentMessage: agentMessage } =
    sliceConversationForAgentMessage(originalConversation, {
      agentMessageId: originalAgentMessage.sId,
      agentMessageVersion: originalAgentMessage.version,
      // Include the current step output.
      //
      // TODO(DURABLE-AGENTS 2025-07-27): Change this as part of the
      // retryOnlyBlockedTools effort (the whole step should not be included,
      // tools successfully ran should be removed, this should be an arg to
      // sliceConversationForAgentMessage)
      step: step + 1,
    });

  // Temporal activity arguments are serialized as JSON, so we need to deserialize them.
  const mcpAction = new MCPActionType(rawMcpAction);
  const action = await AgentMCPAction.findByPk(actionId);
  assert(action, "Action not found");

  const stepContent = await AgentStepContentResource.fetchByModelId(
    action.stepContentId
  );
  assert(stepContent, "Step content not found");

  const stepContentJSON = stepContent.toJSON();
  const { value: functionCallData } = stepContentJSON;
  assert(
    isFunctionCallContent(functionCallData),
    "Step content is not a function call"
  );

  const actionBaseParams: ActionBaseParams = {
    agentMessageId: action.agentMessageId,
    citationsAllocated: action.citationsAllocated,
    functionCallId: functionCallData.value.id,
    functionCallName: actionConfiguration.name,
    generatedFiles: [],
    mcpServerConfigurationId: action.mcpServerConfigurationId,
    params: JSON.parse(functionCallData.value.arguments),
    step,
  };

  const eventStream = runToolWithStreaming(auth, actionConfiguration, {
    action,
    actionBaseParams,
    agentConfiguration,
    agentMessage,
    conversation,
    mcpAction,
    stepContext,
  });

  for await (const event of eventStream) {
    switch (event.type) {
      case "tool_error":
        await updateResourceAndPublishEvent(
          {
            type: "tool_error",
            created: event.created,
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            error: {
              code: event.error.code,
              message: event.error.message,
              metadata: event.error.metadata,
            },
          },
          agentMessageRow,
          {
            conversationId: conversation.sId,
            step,
          }
        );
        return;

      case "tool_success":
        await updateResourceAndPublishEvent(
          {
            type: "agent_action_success",
            created: event.created,
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            action: event.action,
          },
          agentMessageRow,
          {
            conversationId: conversation.sId,
            step,
          }
        );

        // We stitch the action into the agent message. The conversation is expected to include
        // the agentMessage object, updating this object will update the conversation as well.
        agentMessage.actions.push(event.action);
        break;

      case "tool_params":
      case "tool_approve_execution":
      case "tool_notification":
        await updateResourceAndPublishEvent(event, agentMessageRow, {
          conversationId: conversation.sId,
          step,
        });
        break;

      default:
        assertNever(event);
    }
  }
}
