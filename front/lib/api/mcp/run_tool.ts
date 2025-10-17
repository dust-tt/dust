// eslint-disable-next-line dust/enforce-client-types-in-public-api
import type {
  MCPApproveExecutionEvent,
  MCPErrorEvent,
  MCPParamsEvent,
  MCPSuccessEvent,
  ToolNotificationEvent,
} from "@app/lib/actions/mcp";
import { tryCallMCPTool } from "@app/lib/actions/mcp_actions";
import {
  processToolNotification,
  processToolResults,
} from "@app/lib/actions/mcp_execution";
import type {
  ToolEarlyExitEvent,
  ToolPersonalAuthRequiredEvent,
} from "@app/lib/actions/mcp_internal_actions/events";
import { getExitOrPauseEvents } from "@app/lib/actions/mcp_internal_actions/utils";
import { hideFileFromActionOutput } from "@app/lib/actions/mcp_utils";
import type { AgentLoopRunContextType } from "@app/lib/actions/types";
import { handleMCPActionError } from "@app/lib/api/mcp/error";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import type {
  AgentConfigurationType,
  AgentMessageType,
  ConversationType,
} from "@app/types";
import { removeNulls } from "@app/types";

/**
 * Runs a tool with streaming for the given MCP action configuration.
 *
 * All errors within this function must be handled through `handleMCPActionError`
 * to ensure consistent error reporting and proper conversation flow control.
 * TODO(DURABLE_AGENTS 2025-08-05): This function is going to be used only to execute the tool.
 */
export async function* runToolWithStreaming(
  auth: Authenticator,
  {
    action,
    agentConfiguration,
    agentMessage,
    conversation,
  }: {
    action: AgentMCPActionResource;
    agentConfiguration: AgentConfigurationType;
    agentMessage: AgentMessageType;
    conversation: ConversationType;
  },
  options?: { signal?: AbortSignal }
): AsyncGenerator<
  | MCPApproveExecutionEvent
  | MCPErrorEvent
  | MCPParamsEvent
  | MCPSuccessEvent
  | ToolNotificationEvent
  | ToolPersonalAuthRequiredEvent
  | ToolEarlyExitEvent,
  void
> {
  const owner = auth.getNonNullableWorkspace();

  const { toolConfiguration, status, augmentedInputs: inputs } = action;

  const signal = options?.signal;

  const localLogger = logger.child({
    actionConfigurationId: toolConfiguration.sId,
    conversationId: conversation.sId,
    messageId: agentMessage.sId,
    workspaceId: conversation.owner.sId,
  });

  const tags = [
    `action:${toolConfiguration.name}`,
    `mcp_server:${toolConfiguration.mcpServerName}`,
    `workspace:${owner.sId}`,
    `workspace_name:${owner.name}`,
  ];

  const agentLoopRunContext: AgentLoopRunContextType = {
    agentConfiguration,
    agentMessage,
    conversation,
    stepContext: action.stepContext,
    toolConfiguration,
  };

  const toolCallResult = yield* tryCallMCPTool(
    auth,
    inputs,
    agentLoopRunContext,
    {
      progressToken: action.id,
      makeToolNotificationEvent: (notification) =>
        processToolNotification(notification, {
          action,
          agentConfiguration,
          conversation,
          agentMessage,
        }),
      signal,
    }
  );

  // Err here means an exception ahead of calling the tool, like a connection error, an input
  // validation error, or any other kind of error from MCP, but not a tool error, which are returned
  // as content.
  if (toolCallResult.isError) {
    statsDClient.increment("mcp_actions_error.count", 1, tags);

    yield await handleMCPActionError({
      action,
      agentConfiguration,
      agentMessage,
      status,
      errorContent: toolCallResult.content,
    });
    return;
  }

  const { outputItems, generatedFiles } = await processToolResults(auth, {
    action,
    conversation,
    localLogger,
    toolCallResultContent: toolCallResult.content,
    toolConfiguration,
  });

  // Parse the output resources to check if we find special events that require the agent loop to pause.
  // This could be an authentication, validation, or unconditional exit from the action.
  const agentPauseEvents = await getExitOrPauseEvents({
    outputItems,
    action,
    agentConfiguration,
    agentMessage,
    conversation,
  });

  if (agentPauseEvents.length > 0) {
    for (const event of agentPauseEvents) {
      yield event;
    }
    return;
  } else {
    statsDClient.increment("mcp_actions_success.count", 1, tags);

    await action.updateStatus("succeeded");

    yield {
      type: "tool_success",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: {
        ...action.toJSON(),
        output: removeNulls(outputItems.map(hideFileFromActionOutput)),
        generatedFiles,
      },
    };
  }
}
