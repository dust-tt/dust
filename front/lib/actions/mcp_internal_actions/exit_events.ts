import type { MCPApproveExecutionEvent } from "@dust-tt/client";
import { assertNever, isAgentPauseOutputResourceType } from "@dust-tt/client";

import type {
  ToolEarlyExitEvent,
  ToolPersonalAuthRequiredEvent,
} from "@app/lib/actions/mcp_internal_actions/events";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMCPActionOutputItemModel } from "@app/lib/models/agent/actions/mcp";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type {
  AgentConfigurationType,
  AgentMessageType,
  ConversationWithoutContentType,
} from "@app/types";

/**
 * Server-only utility for processing exit/pause events from MCP tool outputs.
 *
 * Do NOT import this file from client-side code.
 */
export async function getExitOrPauseEvents(
  auth: Authenticator,
  {
    outputItems,
    action,
    agentConfiguration,
    agentMessage,
    conversation,
  }: {
    outputItems: AgentMCPActionOutputItemModel[];
    action: AgentMCPActionResource;
    agentConfiguration: AgentConfigurationType;
    agentMessage: AgentMessageType;
    conversation: ConversationWithoutContentType;
  }
): Promise<
  (
    | MCPApproveExecutionEvent
    | ToolPersonalAuthRequiredEvent
    | ToolEarlyExitEvent
  )[]
> {
  const exitOutputItem = outputItems
    .map((item) => item.content)
    .find(isAgentPauseOutputResourceType)?.resource;

  if (exitOutputItem) {
    switch (exitOutputItem.type) {
      case "tool_early_exit": {
        const { isError, text } = exitOutputItem;
        return [
          {
            type: "tool_early_exit",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            conversationId: conversation.sId,
            messageId: agentMessage.sId,
            text: text,
            isError: isError,
          },
        ];
      }
      case "tool_blocked_awaiting_input": {
        const { blockingEvents, state } = exitOutputItem;
        // Update the action status to blocked_child_action_input_required to break the agent loop.
        await action.updateStatus("blocked_child_action_input_required");

        // Update the step context to save the resume state.
        await action.updateStepContext({
          ...action.stepContext,
          resumeState: state,
        });

        // Yield the blocking events.
        return blockingEvents;
      }
      case "tool_personal_auth_required": {
        const { provider, scope } = exitOutputItem;

        const authErrorMessage =
          `The tool ${action.functionCallName} requires personal ` +
          `authentication, please authenticate to use it.`;

        // Update the action to mark it as blocked because of a personal authentication error.
        await action.updateStatus("blocked_authentication_required");

        return [
          {
            type: "tool_personal_auth_required",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            userId: auth.user()?.sId,
            messageId: agentMessage.sId,
            conversationId: conversation.sId,
            actionId: action.sId,
            metadata: {
              toolName: action.toolConfiguration.originalName,
              mcpServerName: action.toolConfiguration.mcpServerName,
              agentName: agentConfiguration.name,
              mcpServerDisplayName: action.toolConfiguration.mcpServerName,
              mcpServerId: action.toolConfiguration.toolServerId,
            },
            inputs: action.augmentedInputs,
            authError: {
              mcpServerId: action.toolConfiguration.toolServerId,
              provider,
              toolName: action.functionCallName ?? "unknown",
              message: authErrorMessage,
              ...(scope && {
                scope,
              }),
            },
          },
        ];
      }
      default: {
        assertNever(exitOutputItem);
      }
    }
  }

  return [];
}
