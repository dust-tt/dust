import assert from "assert";

import { MCPActionType, runToolWithStreaming } from "@app/lib/actions/mcp";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPAction } from "@app/lib/models/assistant/actions/mcp";
import { updateResourceAndPublishEvent } from "@app/temporal/agent_loop/activities/common";
import { buildActionBaseParams } from "@app/temporal/agent_loop/lib/action_utils";
import { sliceConversationForAgentMessage } from "@app/temporal/agent_loop/lib/loop_utils";
import type { ModelId } from "@app/types";
import { assertNever } from "@app/types";
import type { RunAgentArgs } from "@app/types/assistant/agent_run";
import { getRunAgentData } from "@app/types/assistant/agent_run";

export async function runToolActivity(
  authType: AuthenticatorType,
  {
    actionId,
    runAgentArgs,
    step,
  }: {
    actionId: ModelId;
    runAgentArgs: RunAgentArgs;
    step: number;
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

  const action = await AgentMCPAction.findByPk(actionId);
  assert(action, "Action not found");

  await action.update({
    runningState: "running",
  });

  const mcpServerId = action.toolConfiguration.toolServerId;

  const actionBaseParams = await buildActionBaseParams({
    agentMessageId: action.agentMessageId,
    citationsAllocated: action.citationsAllocated,
    mcpServerConfigurationId: action.mcpServerConfigurationId,
    mcpServerId,
    step,
    stepContentId: action.stepContentId,
    status: action.status,
  });

  const mcpAction = new MCPActionType({
    ...actionBaseParams,
    id: action.id,
    isError: action.isError,
    executionState: action.executionState,
    type: "tool_action",
    output: null,
  });

  const eventStream = runToolWithStreaming(auth, {
    action,
    actionBaseParams,
    agentConfiguration,
    agentMessage,
    conversation,
    mcpAction,
    stepContext: action.stepContext,
  });

  for await (const event of eventStream) {
    switch (event.type) {
      case "tool_error":
        await action.update({
          runningState: "errored",
        });

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
        await action.update({
          runningState: "completed",
        });

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
        // Action might have already added earlier, so we to replace it.
        // TODO(DURABLE-AGENTS 2025-08-12): This is a hack to avoid duplicates. Consider fetching
        // at least on every step.
        const existingActionIndex = agentMessage.actions.findIndex(
          (existingAction) => existingAction.id === event.action.id
        );

        if (existingActionIndex >= 0) {
          // Replace existing action with updated one.
          agentMessage.actions[existingActionIndex] = event.action;
        } else {
          // Add new action if it doesn't exist.
          agentMessage.actions.push(event.action);
        }

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
