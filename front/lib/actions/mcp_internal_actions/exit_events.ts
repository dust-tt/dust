import type {
  ToolAskUserQuestionEvent,
  ToolEarlyExitEvent,
  ToolFileAuthRequiredEvent,
  ToolPausedEvent,
  ToolPersonalAuthRequiredEvent,
} from "@app/lib/actions/mcp_internal_actions/events";
import { pauseSandboxBashForBlockedChild } from "@app/lib/api/sandbox/sandbox_child_block";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgentMessageType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import type { MCPApproveExecutionEvent } from "@dust-tt/client";
import { assertNever, isAgentPauseOutputResourceType } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

type MCPActionOutputItemWithContent = {
  content: CallToolResult["content"][number];
};

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
    outputItems: MCPActionOutputItemWithContent[];
    action: AgentMCPActionResource;
    agentConfiguration: AgentConfigurationType;
    agentMessage: AgentMessageType;
    conversation: ConversationWithoutContentType;
  }
): Promise<
  (
    | MCPApproveExecutionEvent
    | ToolAskUserQuestionEvent
    | ToolPersonalAuthRequiredEvent
    | ToolFileAuthRequiredEvent
    | ToolEarlyExitEvent
    | ToolPausedEvent
  )[]
> {
  const exitOutputItem = outputItems
    .map((item) => item.content)
    .find(isAgentPauseOutputResourceType)?.resource;

  if (exitOutputItem) {
    switch (exitOutputItem.type) {
      case "tool_early_exit": {
        const { isError, reason, text } = exitOutputItem;
        const eventIsError = reason === "user_cancellation" ? false : isError;

        return [
          {
            type: "tool_early_exit",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            conversationId: conversation.sId,
            messageId: agentMessage.sId,
            text: text,
            isError: eventIsError,
            reason,
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

        // Forward any UI-facing blocking events the tool collected, plus a
        // `tool_paused` sentinel. The sentinel keeps the pause-decision on
        // the event channel even when `blockingEvents` is empty — the case
        // for any future tool whose blocking event is published upstream
        // out-of-band (e.g. sandbox bash, where the child's blocking event
        // is published by `createSandboxChildAction` and never flows
        // through bash's return). Without it, `runToolWithStreaming` would
        // fall through to `markAsSucceeded` on an already-blocked action.
        // Appended LAST so the for-await in `executeToolStreaming` processes
        // every blocking event before the sentinel triggers the return.
        return [
          ...blockingEvents,
          {
            type: "tool_paused",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            conversationId: conversation.sId,
            actionId: action.sId,
          },
        ];
      }
      case "tool_personal_auth_required": {
        const { provider, scope } = exitOutputItem;

        const authErrorMessage =
          `The tool ${action.functionCallName} requires personal ` +
          `authentication, please authenticate to use it.`;

        // Update the action to mark it as blocked because of a personal authentication error.
        await action.updateStatus("blocked_authentication_required");
        await pauseSandboxBashForBlockedChild(auth, action, conversation);

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
      case "tool_file_auth_required": {
        const { fileId, fileName, connectionId, mimeType_file } =
          exitOutputItem;

        const fileAuthErrorMessage =
          `The tool ${action.functionCallName} requires file authorization ` +
          `for ${fileName}, please authorize the file to continue.`;

        await action.updateStatus("blocked_file_authorization_required");
        await pauseSandboxBashForBlockedChild(auth, action, conversation);

        // Persisted here so the blocked action can be reconstructed on page reload.
        await action.updateStepContext({
          ...action.stepContext,
          fileAuthorizationInfo: {
            fileId,
            fileName,
            connectionId,
            mimeType: mimeType_file,
          },
        });

        return [
          {
            type: "tool_file_auth_required",
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
            fileAuthError: {
              fileId,
              fileName,
              connectionId,
              mimeType: mimeType_file,
              toolName: action.functionCallName ?? "unknown",
              message: fileAuthErrorMessage,
            },
          },
        ];
      }
      case "tool_user_answer_required": {
        const { question } = exitOutputItem;

        await action.updateStatus("blocked_user_answer_required");
        await pauseSandboxBashForBlockedChild(auth, action, conversation);

        await action.updateStepContext({
          ...action.stepContext,
          resumeState: { type: "user_question", question },
        });

        return [
          {
            type: "tool_ask_user_question",
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
            },
            inputs: action.augmentedInputs,
            question,
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
